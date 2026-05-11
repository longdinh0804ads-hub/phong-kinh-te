# Deployment Guide — App PKT Xã Trần Phú

**Cập nhật:** 2026-05-11
**Nền tảng mục tiêu:** VPS Ubuntu 22.04 LTS (self-host)

> **Thay đổi quan trọng:** Dự án đã chuyển từ Vercel (trước đây) sang **VPS self-host** để đảm bảo data sovereignty và kiểm soát toàn bộ stack bảo mật (LUKS, systemd hardening, backup GPG). Không còn dùng Vercel.

---

## Yêu cầu hệ thống

| Thành phần | Yêu cầu tối thiểu |
|-----------|-----------------|
| VPS | Ubuntu 22.04 LTS, 4 vCPU, 4-8 GB RAM, 80 GB SSD |
| IPv4 | Tĩnh, ưu tiên DC trong nước (VN) |
| Domain | Tên miền riêng (`.vn`), trỏ A record về VPS |
| Node.js | 20 LTS |
| PostgreSQL | 16 + pgvector |
| Nginx | 1.24+ |

---

## Tổng quan deploy

```
[Dev machine] → git push → [VPS /opt/loha/app]
                                    │
                        npm run build (standalone)
                                    │
                        systemd pkt-app.service
                                    │
                        Nginx :443 ← Let's Encrypt TLS
                                    │
                        PostgreSQL /srv/data (LUKS)
                                    │
                        Cron backup → Windows local (GPG encrypted)
```

---

## Hướng dẫn chi tiết (7 bước)

Toàn bộ hướng dẫn step-by-step bao gồm:
- LUKS encryption setup
- PostgreSQL trên encrypted volume
- Key generation và paper key
- Deploy app + systemd
- Nginx TLS 1.3 + Let's Encrypt
- Backup GPG + rsync Windows
- Checklist post-deploy

**Xem tại:** [docs/security-deployment.md](security-deployment.md)

---

## Môi trường biến (Production)

Lưu tại `/etc/loha/app.env` (chmod 0400, owner loha):

```bash
# Database
DATABASE_URL=postgresql://pkt:<password>@localhost:5432/phong_kinh_te
DIRECT_DATABASE_URL=postgresql://pkt:<password>@localhost:5432/phong_kinh_te

# Better Auth
BETTER_AUTH_SECRET=<96+ hex chars>
BETTER_AUTH_URL=https://pkt-tranphu.vn
NEXT_PUBLIC_APP_URL=https://pkt-tranphu.vn

# App info
APP_NAME=PKT Trần Phú
APP_URL=https://pkt-tranphu.vn

# Crypto keys (sinh bằng scripts/generate-encryption-keys.ts)
DATA_ENCRYPTION_KEY=<64 hex chars>   # AES-256 master key
BLIND_INDEX_KEY=<64 hex chars>       # Blind index HMAC key (riêng biệt)
PASSWORD_PEPPER=<64 hex chars>       # Argon2id pepper

# Cron
CRON_SECRET=<64 hex chars>

# Email (Resend)
RESEND_API_KEY=re_xxxx
RESEND_FROM_EMAIL=no-reply@pkt-tranphu.vn

# Captcha (Cloudflare Turnstile)
TURNSTILE_SECRET_KEY=0x...
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x...

# AI providers
GEMINI_API_KEY=AIza...
# Optional fallback:
# DEEPSEEK_API_KEY=...
# ANTHROPIC_API_KEY=...

# Backup (Windows server qua Wireguard VPN)
REMOTE_BACKUP_USER=backup
REMOTE_BACKUP_HOST=192.168.1.10
REMOTE_BACKUP_PATH=/d/loha-backup
REMOTE_BACKUP_PORT=22
```

---

## Các bước triển khai tóm tắt

### 1. Chuẩn bị server

```bash
# Hardening SSH
sudo nano /etc/ssh/sshd_config
# Port 2222; PasswordAuthentication no; PermitRootLogin no

# Firewall
sudo ufw allow 2222/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
sudo ufw enable

# User app
sudo adduser --system --group --shell /bin/bash --home /opt/loha loha
```

### 2. Cài dependencies

```bash
# PostgreSQL 16 + pgvector
sudo apt install -y postgresql-16 postgresql-16-pgvector

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs nginx certbot python3-certbot-nginx fail2ban
```

### 3. LUKS + PostgreSQL

```bash
# LUKS partition (xem security-deployment.md §2 chi tiết)
sudo cryptsetup luksFormat /dev/sdb1
sudo cryptsetup luksOpen /dev/sdb1 loha-data
sudo mkfs.ext4 /dev/mapper/loha-data
sudo mount /dev/mapper/loha-data /srv/data

# Move PostgreSQL data → encrypted volume
sudo systemctl stop postgresql
sudo rsync -av /var/lib/postgresql/16/main/ /srv/data/postgresql/
# Sửa data_directory trong postgresql.conf
sudo systemctl start postgresql
```

### 4. Sinh + lưu keys

```bash
cd /opt/loha/app
npx tsx scripts/generate-encryption-keys.ts > /tmp/keys.txt
sudo mkdir -p /etc/loha && sudo cp /tmp/keys.txt /etc/loha/app.env
sudo chown -R loha:loha /etc/loha && sudo chmod 0400 /etc/loha/app.env
# In paper key, cất két sắt (xem template trong security-deployment.md §4)
shred -u /tmp/keys.txt
```

### 5. Deploy app

```bash
# Clone + build
sudo -u loha git clone <repo-url> /opt/loha/app
cd /opt/loha/app && sudo -u loha npm install --omit=dev

# Bật standalone output trong next.config.ts:
# output: "standalone",
sudo -u loha npm run build
sudo -u loha npx prisma db push

# Backfill encrypt data cũ (nếu migrate từ demo)
sudo -u loha -- bash -c 'set -a; source /etc/loha/app.env; set +a; npx tsx scripts/backfill-encrypt.ts --dry'
# Review, sau đó:
sudo -u loha -- bash -c 'set -a; source /etc/loha/app.env; set +a; npx tsx scripts/backfill-encrypt.ts'

# Systemd service
sudo cp deploy/systemd/pkt-app.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now pkt-app
```

### 6. Nginx + TLS

```bash
sudo cp deploy/nginx/pkt-tranphu.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/pkt-tranphu.conf /etc/nginx/sites-enabled/

# Thêm rate-limit zones vào /etc/nginx/nginx.conf http block:
# limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=10r/m;
# limit_req_zone $binary_remote_addr zone=api_limit:10m rate=60r/m;

sudo nginx -t && sudo systemctl reload nginx

# Let's Encrypt (domain phải trỏ về VPS trước)
sudo certbot --nginx -d pkt-tranphu.vn -d www.pkt-tranphu.vn
```

### 7. Backup cron

```bash
sudo cp deploy/backup/backup-encrypted.sh /opt/loha/scripts/
sudo chmod +x /opt/loha/scripts/backup-encrypted.sh

# /etc/cron.d/loha-backup:
# 0 2 * * * loha /opt/loha/scripts/backup-encrypted.sh >> /var/log/loha-backup.log 2>&1
```

---

## Risk Scanner Cron

Trên VPS, thêm vào crontab (cùng user loha hoặc systemd timer):

```
*/30 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://pkt-tranphu.vn/api/cron/risk-scan
```

Hoặc dùng cron-job.org (external) trỏ vào URL app.

---

## Post-deploy checklist

Sau khi deploy, chạy toàn bộ checklist tại [security-deployment.md §7](security-deployment.md#7-checklist-sau-triển-khai):
- Authentication (login, lockout, 2FA, backup codes)
- Session (cookie flags, binding, expiry)
- Encryption (DB ciphertext, app plaintext, search)
- Security headers (SSL Labs A+, securityheaders A)
- Backup (GPG file, restore test)
- Email alerts (Resend delivery)
- Monitoring (logs, audit)

---

## Lệnh ops thường dùng

```bash
# Xem app logs
journalctl -u pkt-app -f

# Restart app
sudo systemctl restart pkt-app

# Xem Nginx access log
tail -f /var/log/nginx/access.log

# Chạy backup thủ công
sudo -u loha /opt/loha/scripts/backup-encrypted.sh

# Kiểm tra DB encryption
sudo -u loha -- bash -c 'set -a; source /etc/loha/app.env; set +a; npx tsx scripts/verify-encrypted-data.ts'

# Deploy update
cd /opt/loha/app
sudo -u loha git pull
sudo -u loha npm install --omit=dev
sudo -u loha npm run build
sudo systemctl restart pkt-app
```

---

## Sau 12 tháng — Key Rotation

Xem `docs/security-key-rotation.md` (sẽ viết khi đến hạn) cho quy trình rotate `DATA_ENCRYPTION_KEY` với lazy re-encrypt strategy.
