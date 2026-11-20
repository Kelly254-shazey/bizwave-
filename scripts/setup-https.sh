#!/usr/bin/env bash
# =============================================================================
# BizWave Automated Let's Encrypt HTTPS Setup for Production VPS
# Prerequisite: DNS A-record for <domain> already points to this VPS public IP,
#               ports 80 and 443 are open in UFW, and ./scripts/deploy-vps.sh ran.
# Usage:
#   ./scripts/setup-https.sh app.yourdomain.co.ke founder@yourdomain.co.ke
# =============================================================================
set -euo pipefail

REQUESTED_DOMAIN="${1:?Usage: $0 <domain> <email>}"
EMAIL="${2:?Usage: $0 <domain> <email>}"
if [[ ${#REQUESTED_DOMAIN} -gt 253 || ! "$REQUESTED_DOMAIN" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ || "$REQUESTED_DOMAIN" == *..* ]]; then
  echo 'Please supply a valid DNS hostname.' >&2
  exit 2
fi
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env.production"
[[ -f "$ENV_FILE" ]] || { echo 'Run the deployment script first.' >&2; exit 1; }
# Confirm the certificate hostname matches the existing deployment.
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
if [[ "${DOMAIN:-}" != "$REQUESTED_DOMAIN" ]]; then
  echo 'The requested hostname differs from DOMAIN in .env.production.' >&2
  exit 1
fi
DOMAIN="$REQUESTED_DOMAIN"

cd "$ROOT_DIR"

echo "=== [1/3] Requesting Let's Encrypt TLS certificate for ${DOMAIN} ==="
docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml --profile ssl run --rm certbot \
  certonly --webroot \
  --webroot-path /var/www/certbot \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN"

echo "=== [2/3] Activating hardened TLS 1.2/1.3 Nginx configuration ==="
sed "s/__DOMAIN__/${DOMAIN}/g" \
  "${ROOT_DIR}/infrastructure/nginx/nginx.prod.conf.template" \
  > "${ROOT_DIR}/infrastructure/nginx/active.conf"

docker exec bizwave-nginx nginx -t
docker exec bizwave-nginx nginx -s reload

echo "=== [3/3] Verifying live HTTPS endpoint ==="
curl -sf "https://${DOMAIN}/api/v1/health" && echo ""
echo ""
echo "✅ HTTPS is LIVE at https://${DOMAIN}!"
echo "Recommended renewal cron (run 'crontab -e'):"
echo "  0 3 * * * cd ${ROOT_DIR} && docker compose --env-file .env.production -f docker-compose.prod.yml --profile ssl run --rm certbot renew --quiet && docker exec bizwave-nginx nginx -s reload"
