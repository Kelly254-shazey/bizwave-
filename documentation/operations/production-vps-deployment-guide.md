# BizWave Production VPS Deployment & Live Pitching Guide (Zero-Demo)

This guide deploys BizWave cleanly to any Ubuntu 22.04/24.04 VPS (DigitalOcean, Hetzner, AWS EC2, Safaricom Cloud, Linode) with **Docker Compose**, **Nginx TLS 1.3 (Let's Encrypt HTTPS)**, **zero demo data**, and **fail-closed production security**.

---

## 1. Recommended VPS Sizing
- **Minimum Production / Live Pitch VPS:** `2 vCPU · 4 GB RAM · 40 GB SSD` (Ubuntu 24.04 LTS — ~$12–$24/month)
- **Domain:** Point an `A` record (e.g., `app.bizwave.co.ke` or `bizwave.co.ke`) to your VPS IPv4 address.

---

## 2. One-Time VPS Preparation (Ubuntu 24.04)

SSH into your server and install Docker + firewall rules (ONLY ports `22`, `80`, and `443` exposed):

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
newgrp docker

# Lock down firewall — Postgres (5432), Redis (6379), API (4000) stay strictly internal!
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

---

## 3. Upload Code & Deploy Production Stack (Zero Demo Data)

Upload `/home/user/bizwave` (via `git clone` or `rsync`/`scp`) to `/opt/bizwave` on your VPS, then run:

```bash
cd /opt/bizwave
chmod +x scripts/deploy-vps.sh scripts/setup-https.sh infrastructure/scripts/backup-postgres.sh infrastructure/scripts/restore-postgres.sh

./scripts/deploy-vps.sh app.yourdomain.co.ke
```

**What `deploy-vps.sh` automatically enforces:**
- Generates high-entropy cryptographic secrets into `.env.production` (`chmod 600`) via OpenSSL (`JWT_SECRET`, 256-bit `APP_ENCRYPTION_KEY`, `WEBHOOK_SIGNING_SECRET`, unique DB/Redis passwords).
- Applies migrations `001`–`007` and seeds **ONLY** production reference data (`001` subscription plans/RBAC/industry templates + `003` public Community Literacy curriculum). **`002_kenyan_sme_demo_tenants.sql` is NEVER loaded.**
- Enforces least-privilege PostgreSQL roles: `bizwave_owner` (`NOSUPERUSER BYPASSRLS` for migrations/backups) and `bizwave_app` (`NOSUPERUSER NOBYPASSRLS` for the runtime API).
- Starts all 6 containers behind private Docker networking and verifies `/api/v1/health`.

---

## 4. Enable Free HTTPS (Let's Encrypt TLS 1.2/1.3)

Once your DNS `A` record resolves to the VPS IP:

```bash
./scripts/setup-https.sh app.yourdomain.co.ke founder@yourdomain.co.ke
```

Your production app is now live over HTTPS with HSTS preload, strict CORS, CSP, and zero demo artifacts at **`https://app.yourdomain.co.ke`**.

---

## 5. Optional Live Provider Keys (`.env.production`)

All provider adapters are live and fail honestly when unconfigured. Add real keys in `/opt/bizwave/.env.production` when ready and restart only `backend`:

```bash
# Kenyan Swahili/English Voice (MsingiAI Sauti — KES prepaid API or self-hosted URL)
MSINGI_API_KEY=your_live_msingi_key
MSINGI_BASE_URL=https://api.msingiai.com
```
```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d backend
```

Africa's Talking (SMS/Voice/USSD) and Meta WhatsApp credentials are configured encrypted (AES-256-GCM) inside **Connect → Channel Providers** per registered tenant.

---

## 6. Automated Daily Encrypted Backups (Cron)

Add a daily 02:30 EAT backup job (`crontab -e`):

```cron
30 2 * * * docker exec -e PGPASSWORD="$(grep BIZWAVE_OWNER_PASSWORD /opt/bizwave/.env.production | cut -d= -f2)" bizwave-postgres pg_dump -U bizwave_owner -Fc --no-owner bizwave > /var/backups/bizwave/bizwave_$(date +\%Y\%m\%d).dump && find /var/backups/bizwave -name '*.dump' -mtime +30 -delete
```

---

## 7. Live Pitching Flow (100% Real, Zero Demo Accounts)

1. Open **`https://app.yourdomain.co.ke`** — crisp Apple-minimal site aligned with your 11-slide Canva deck (`Starter` → `Growth` → `Intelligence` → `Multi-Branch / Enterprise`).
2. Click **Register Your Business** (`/register`) to create your real production workspace live (takes ~20 seconds) — isolated by PostgreSQL Row-Level Security.
3. Upload a real business spreadsheet (`.csv` or `.xlsx`) in **Analytics → Imports** (using **Download CSV Template** if needed), validate row quality, and commit live.
4. Show real **Analytics KPIs**, **BizWave Predict** forecasting & anomaly detection, **BizWave AI (English & Kiswahili)**, **BizWave Connect**, and the public **Community Learn & Buyer Guide** (`/learn`).
