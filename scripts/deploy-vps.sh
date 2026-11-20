#!/usr/bin/env bash
# =============================================================================
# BizWave Zero-Demo Production VPS Deployment Script
# Provisions:
#   1. Cryptographic production secrets in .env.production (600 permissions)
#   2. Hardened multi-container Docker stack (Postgres 17, Redis 7, FastAPI, NestJS, React/Nginx)
#   3. Pending versioned migrations + only production reference seeds (001)
#      -> ZERO demo tenants, ZERO test passwords, ZERO fake records.
#   4. Least-privilege DB roles: bizwave_owner (NOSUPERUSER BYPASSRLS) & bizwave_app (NOBYPASSRLS)
#
# Usage:
#   ./scripts/deploy-vps.sh app.yourdomain.co.ke
# =============================================================================
set -euo pipefail

REQUESTED_DOMAIN="${1:?Usage: $0 <your-domain.co.ke>}"
if [[ ${#REQUESTED_DOMAIN} -gt 253 || ! "$REQUESTED_DOMAIN" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ || "$REQUESTED_DOMAIN" == *..* ]]; then
  echo "Please supply a valid DNS hostname." >&2
  exit 2
fi
DOMAIN="$REQUESTED_DOMAIN"
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
CORS_ORIGINS=https://${DOMAIN}
ENABLE_SWAGGER=false
# Temporarily open the four portal feature gates across plans; RBAC remains enforced.
PORTAL_FEATURE_GATING_ENABLED=false

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
chmod 600 "$ENV_FILE"
if [[ "$DOMAIN" != "$REQUESTED_DOMAIN" ]]; then
  echo "The existing .env.production DOMAIN does not match the requested hostname; review the configuration first." >&2
  exit 1
fi
# These passwords are embedded into SQL and connection URLs. Restrict them to
# URL-safe characters, preventing quoting errors and SQL injection via .env.
for key in BIZWAVE_OWNER_PASSWORD BIZWAVE_APP_PASSWORD REDIS_PASSWORD; do
  value="${!key:-}"
  if [[ ! "$value" =~ ^[A-Za-z0-9_-]{24,}$ ]]; then
    echo "$key must be at least 24 URL-safe alphanumeric, underscore or hyphen characters." >&2
    exit 1
  fi
done
if [[ ! "${POSTGRES_DB:-}" =~ ^[A-Za-z_][A-Za-z0-9_]{0,62}$ ]]; then
  echo "POSTGRES_DB must be a simple PostgreSQL identifier." >&2
  exit 1
fi

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

echo "=== [4/5] Applying pending migrations & clean reference seeds (no demo data) ==="
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
GRANT CONNECT ON DATABASE "${POSTGRES_DB}" TO bizwave_owner, bizwave_app;
GRANT CREATE, USAGE ON SCHEMA public TO bizwave_owner;
GRANT USAGE ON SCHEMA public TO bizwave_app;
SQL

"${ROOT_DIR}/scripts/apply-migrations.sh" \
  docker exec -i bizwave-postgres psql -U postgres -d "${POSTGRES_DB}"

docker exec -i bizwave-postgres psql -U postgres -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 \
  < "${ROOT_DIR}/infrastructure/postgres/grant-runtime-access.sql"

docker exec -i bizwave-postgres psql -U postgres -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 -v dbname="${POSTGRES_DB}" <<'SQL'
SELECT format('ALTER DATABASE %I OWNER TO bizwave_owner', :'dbname') \gexec
SQL

echo "=== [5/5] Building & Starting Full Production Stack ==="
docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml up -d --build

echo "Waiting for the HTTP health check..."
healthy=false
for _ in {1..30}; do
  if curl -sf http://127.0.0.1/api/v1/health; then healthy=true; break; fi
  sleep 2
done
if [[ "$healthy" != "true" ]]; then
  echo "Health check did not become ready; inspect docker compose logs." >&2
  exit 1
fi
echo ""
echo "✅ BizWave stack is responding. Existing data was preserved."
echo "Next step — enable free Let's Encrypt HTTPS for ${DOMAIN}:"
echo "  ./scripts/setup-https.sh ${DOMAIN} founder@${DOMAIN}"
