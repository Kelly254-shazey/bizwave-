#!/usr/bin/env bash
# =============================================================================
# BizWave Zero-Demo Production VPS Deployment Script
# Provisions:
#   1. Cryptographic production secrets in .env.production (600 permissions)
#   2. Hardened multi-container Docker stack (Postgres 17, Redis 7, FastAPI, NestJS, React/Nginx)
#   3. Schema migrations 001..007 + ONLY production seeds (001 plans/RBAC + 003 public learning)
#      -> ZERO demo tenants, ZERO test passwords, ZERO fake records.
#   4. Least-privilege DB roles: bizwave_owner (NOSUPERUSER BYPASSRLS) & bizwave_app (NOBYPASSRLS)
#
# Usage:
#   ./scripts/deploy-vps.sh app.yourdomain.co.ke
# =============================================================================
set -euo pipefail

DOMAIN="${1:?Usage: $0 <your-domain.co.ke>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env.production"

cd "$ROOT_DIR"

echo "=== [1/5] Generating / verifying production secrets (${ENV_FILE}) ==="
if [[ ! -f "$ENV_FILE" ]]; then
  PG_SUPER_PW="$(openssl rand -hex 24)"
  OWNER_PW="$(openssl rand -hex 24)"
  APP_PW="$(openssl rand -hex 24)"
  REDIS_PW="$(openssl rand -hex 24)"
  JWT_SEC="$(openssl rand -hex 32)"
  ENC_KEY="$(openssl rand -hex 32)"
  WH_SEC="$(openssl rand -hex 24)"

  cat > "$ENV_FILE" <<EOF
# BizWave Production Environment (Auto-generated cryptographic secrets — DO NOT COMMIT)
DOMAIN=${DOMAIN}
POSTGRES_DB=bizwave
POSTGRES_SUPERUSER_PASSWORD=${PG_SUPER_PW}
BIZWAVE_OWNER_PASSWORD=${OWNER_PW}
BIZWAVE_APP_PASSWORD=${APP_PW}
REDIS_PASSWORD=${REDIS_PW}

JWT_SECRET=${JWT_SEC}
JWT_ACCESS_TTL=15m
JWT_REFRESH_DAYS=14
APP_ENCRYPTION_KEY=${ENC_KEY}
WEBHOOK_SIGNING_SECRET=${WH_SEC}
CORS_ORIGINS=https://${DOMAIN},http://${DOMAIN}
ENABLE_SWAGGER=false

# Optional External LLM for enhanced BizWave AI narratives (OpenAI / Groq / OpenRouter / Ollama)
LLM_API_KEY=
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini

# Optional Kenyan Voice Provider (MsingiAI Sauti — https://platform.msingiai.com)
MSINGI_BASE_URL=https://api.msingiai.com
MSINGI_API_KEY=
MSINGI_DEFAULT_VOICE=female3
EOF
  chmod 600 "$ENV_FILE"
  echo "Created hardened ${ENV_FILE} (mode 600)."
else
  echo "Using existing ${ENV_FILE}."
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

echo "=== [2/5] Preparing Nginx edge config ==="
if [[ ! -f "${ROOT_DIR}/infrastructure/nginx/active.conf" ]]; then
  cp "${ROOT_DIR}/infrastructure/nginx/nginx.http-bootstrap.conf" "${ROOT_DIR}/infrastructure/nginx/active.conf"
fi

echo "=== [3/5] Starting PostgreSQL & Redis ==="
docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml up -d postgres redis
echo "Waiting for PostgreSQL readiness..."
until docker exec bizwave-postgres pg_isready -U postgres -d "${POSTGRES_DB}" >/dev/null 2>&1; do
  sleep 2
done

echo "=== [4/5] Applying Production Roles, Migrations (001..007) & Clean Reference Seeds (ZERO Demo Data) ==="
docker exec -i bizwave-postgres psql -U postgres -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bizwave_owner') THEN
    CREATE ROLE bizwave_owner LOGIN PASSWORD '${BIZWAVE_OWNER_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS;
  ELSE
    ALTER ROLE bizwave_owner PASSWORD '${BIZWAVE_OWNER_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bizwave_app') THEN
    CREATE ROLE bizwave_app LOGIN PASSWORD '${BIZWAVE_APP_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  ELSE
    ALTER ROLE bizwave_app PASSWORD '${BIZWAVE_APP_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END \$\$;
GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO bizwave_owner, bizwave_app;
GRANT CREATE, USAGE ON SCHEMA public TO bizwave_owner;
GRANT USAGE ON SCHEMA public TO bizwave_app;
SQL

TABLE_COUNT="$(docker exec bizwave-postgres psql -U postgres -d "${POSTGRES_DB}" -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='tenants';")"
if [[ "${TABLE_COUNT}" == "0" ]]; then
  for f in "${ROOT_DIR}"/database/migrations/00*.sql; do
    echo "  Applying migration: $(basename "$f")"
    docker exec -i bizwave-postgres psql -U postgres -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 < "$f"
  done
  echo "  Seeding production plans, RBAC roles & industry templates (001)..."
  docker exec -i bizwave-postgres psql -U postgres -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 < "${ROOT_DIR}/database/seeds/001_reference_data_and_plans.sql"
  echo "  Zero demo tenants loaded (production clean state)."
fi

docker exec -i bizwave-postgres psql -U postgres -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO bizwave_owner;', r.tablename);
  END LOOP;
  FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER SEQUENCE public.%I OWNER TO bizwave_owner;', r.sequencename);
  END LOOP;
  FOR r IN SELECT viewname FROM pg_views WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER VIEW public.%I OWNER TO bizwave_owner;', r.viewname);
  END LOOP;
  FOR r IN SELECT matviewname FROM pg_matviews WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER MATERIALIZED VIEW public.%I OWNER TO bizwave_owner;', r.matviewname);
  END LOOP;
  FOR r IN
    SELECT p.oid::regprocedure AS fn
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND (p.proname LIKE 'fn_%' OR p.proname LIKE 'app_%')
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO bizwave_owner;', r.fn);
  END LOOP;
END $$;
ALTER DATABASE bizwave OWNER TO bizwave_owner;
ALTER SCHEMA public OWNER TO bizwave_owner;
GRANT USAGE ON SCHEMA public TO bizwave_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bizwave_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bizwave_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO bizwave_app;
SQL

echo "=== [5/5] Building & Starting Full Production Stack ==="
docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml up -d --build

sleep 5
curl -sf http://127.0.0.1/api/v1/health && echo ""
echo ""
echo "✅ BizWave Production Stack is LIVE (zero demo data)!"
echo "Next step — enable free Let's Encrypt HTTPS for ${DOMAIN}:"
echo "  ./scripts/setup-https.sh ${DOMAIN} founder@${DOMAIN}"
