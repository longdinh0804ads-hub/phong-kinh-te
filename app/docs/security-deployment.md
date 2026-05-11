# Triển khai bảo mật - PKT Trần Phú

Hướng dẫn step-by-step deploy hệ thống lên **VPS Ubuntu 22.04 LTS** với toàn bộ lớp bảo mật P1-P4.

## Mục lục

1. [Chuẩn bị server](#1-chuẩn-bị-server)
2. [Cài LUKS encryption (lớp đĩa)](#2-cài-luks-encryption)
3. [Cài PostgreSQL + Nginx + Node.js](#3-cài-postgresql--nginx--nodejs)
4. [Sinh + bảo quản key mã hóa](#4-sinh--bảo-quản-key-mã-hóa)
5. [Deploy app](#5-deploy-app)
6. [Backup encrypted + đồng bộ Windows local](#6-backup-encrypted)
7. [Verify checklist sau triển khai](#7-checklist-sau-triển-khai)

---

## 1. Chuẩn bị server

### Yêu cầu phần cứng
- 4 vCPU, 4-8 GB RAM, 80 GB SSD
- IPv4 tĩnh, đặt trong DC trong nước (VN) nếu có thể

### Hardening cơ bản
```bash
# 1. Đổi SSH port + tắt password auth
sudo nano /etc/ssh/sshd_config
# Port 2222
# PasswordAuthentication no
# PermitRootLogin no
# PubkeyAuthentication yes

# 2. Firewall
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 2222/tcp        # SSH custom port
sudo ufw allow 80/tcp          # HTTP (cho Let's Encrypt)
sudo ufw allow 443/tcp         # HTTPS
sudo ufw enable

# 3. Tạo user app riêng (KHÔNG dùng root cho service)
sudo adduser --system --group --shell /bin/bash --home /opt/loha loha
sudo usermod -aG sudo loha   # tạm - sau khi setup xong revoke

# 4. Fail2ban
sudo apt install -y fail2ban
# Config /etc/fail2ban/jail.local: enable sshd jail
```

---

## 2. Cài LUKS encryption

LUKS mã hóa **toàn bộ filesystem** chứa DB + key files - chống stolen disk.

### Trên server mới (chưa có data):
```bash
# Tạo partition riêng cho data (vd /dev/sdb1 100GB)
sudo cryptsetup luksFormat /dev/sdb1
sudo cryptsetup luksOpen /dev/sdb1 loha-data
sudo mkfs.ext4 /dev/mapper/loha-data
sudo mkdir /srv/data
sudo mount /dev/mapper/loha-data /srv/data
```

### Auto-unlock at boot (TPM-backed nếu có):
```bash
# Option A: Passphrase nhập thủ công khi boot (an toàn nhất, cần admin có mặt)
# → Mỗi lần reboot phải nhập passphrase

# Option B: Auto-unlock qua key file trên USB (cắm khi boot, rút sau khi xong)
# /etc/crypttab:
# loha-data UUID=xxx /mnt/usb/loha-key.bin

# Option C (Ubuntu 22+): Clevis + TPM2 (yêu cầu motherboard có TPM 2.0)
sudo apt install -y clevis clevis-luks clevis-tpm2 clevis-systemd
sudo clevis luks bind -d /dev/sdb1 tpm2 '{"pcr_ids":"7"}'
# Boot: tự unlock không cần passphrase, nhưng vẫn chống stolen disk
```

### Mount cho PostgreSQL + key files:
```bash
sudo mkdir /srv/data/postgresql /srv/data/loha-keys
sudo chown postgres:postgres /srv/data/postgresql
sudo chmod 700 /srv/data/postgresql
sudo chown loha:loha /srv/data/loha-keys
sudo chmod 700 /srv/data/loha-keys
```

---

## 3. Cài PostgreSQL + Nginx + Node.js

```bash
# PostgreSQL 16
sudo apt install -y postgresql-16 postgresql-16-pgvector
# Move data → encrypted volume
sudo systemctl stop postgresql
sudo rsync -av /var/lib/postgresql/16/main/ /srv/data/postgresql/
sudo nano /etc/postgresql/16/main/postgresql.conf
# data_directory = '/srv/data/postgresql'
sudo systemctl start postgresql

# Tạo DB
sudo -u postgres createuser -P pkt   # nhập password
sudo -u postgres createdb -O pkt phong_kinh_te
sudo -u postgres psql -d phong_kinh_te -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs

# Nginx
sudo apt install -y nginx
# Certbot
sudo apt install -y certbot python3-certbot-nginx
```

---

## 4. Sinh + bảo quản key mã hóa

```bash
# 1. Sinh keys
cd /opt/loha/app
npx tsx scripts/generate-encryption-keys.ts > /tmp/keys.txt

# 2. Lưu vào /etc/loha/keys (file 0400, owner loha)
sudo mkdir -p /etc/loha
sudo cp /tmp/keys.txt /etc/loha/app.env
sudo chown -R loha:loha /etc/loha
sudo chmod 0700 /etc/loha
sudo chmod 0400 /etc/loha/app.env

# 3. Backup paper key (in ra giấy, cất két)
cat /tmp/keys.txt
# In trang này, kẹp folder bảo mật, cất 2 nơi:
#  - Phòng TP
#  - Phòng PTP / két sắt cơ quan

# 4. Xóa file tạm
shred -u /tmp/keys.txt
```

### Backup paper key form (in ra, ký tên):

```
═══════════════════════════════════════════════════════
   LOHA / PKT TRẦN PHÚ - PAPER KEY
═══════════════════════════════════════════════════════
Sinh ngày: 2026-__-__
Sinh bởi:  ______________________________
Ký tên:    ______________________________
Nhân chứng:______________________________
───────────────────────────────────────────────────────
DATA_ENCRYPTION_KEY="________________________________"
BLIND_INDEX_KEY="____________________________________"
PASSWORD_PEPPER="____________________________________"
BETTER_AUTH_SECRET="_________________________________"
CRON_SECRET="________________________________________"
───────────────────────────────────────────────────────
LƯU Ý:
  - Hủy file digital sau khi đã ký nhận
  - Mất file này = mất toàn bộ data
  - Rotate sau 12 tháng
═══════════════════════════════════════════════════════
```

---

## 5. Deploy app

```bash
# Clone code → /opt/loha/app
sudo -u loha git clone <repo-url> /opt/loha/app
cd /opt/loha/app
sudo -u loha npm install --omit=dev

# Bật standalone build trong next.config.ts:
#   output: "standalone",
sudo -u loha npm run build

# Apply schema
sudo -u loha npx prisma db push

# Tạo super admin
sudo -u loha -- bash -c 'set -a; source /etc/loha/app.env; set +a; npx tsx scripts/create-super-admin.ts'

# Backfill encrypt dữ liệu cũ (nếu migrate từ Vercel)
sudo -u loha -- bash -c 'set -a; source /etc/loha/app.env; set +a; npx tsx scripts/backfill-encrypt.ts --dry'
# Review output, sau đó:
sudo -u loha -- bash -c 'set -a; source /etc/loha/app.env; set +a; npx tsx scripts/backfill-encrypt.ts'

# Systemd service
sudo cp deploy/systemd/pkt-app.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pkt-app
sudo systemctl status pkt-app

# Nginx config
sudo cp deploy/nginx/pkt-tranphu.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/pkt-tranphu.conf /etc/nginx/sites-enabled/
# Thêm rate-limit zone vào /etc/nginx/nginx.conf:
#   http {
#       limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=10r/m;
#       limit_req_zone $binary_remote_addr zone=api_limit:10m rate=60r/m;
#   }
sudo nginx -t
sudo systemctl reload nginx

# Let's Encrypt cert (cần domain trỏ tới VPS trước)
sudo certbot --nginx -d pkt-tranphu.vn -d www.pkt-tranphu.vn
# Auto renew: certbot tự cron, test bằng: sudo certbot renew --dry-run

# HSTS preload list (sau khi đã chạy 1-2 tuần ổn):
# Truy cập https://hstspreload.org/?domain=pkt-tranphu.vn để submit
```

---

## 6. Backup encrypted

### Trên VPS:
```bash
# 1. Sinh GPG keypair cho backup
sudo -u loha gpg --full-generate-key
#  - Type: 1 (RSA và RSA)
#  - Key size: 4096
#  - Expires: 0 (never)
#  - Name: Loha Backup
#  - Email: backup@loha.local
#  - Passphrase: ĐỂ TRỐNG (sẽ encrypt với public key, không cần passphrase)

# 2. Export public key (cho server backup)
sudo -u loha gpg --armor --export backup@loha.local > /etc/loha/keys/backup-pub.asc

# 3. Export private key (giữ cô lập - cần để restore)
sudo -u loha gpg --armor --export-secret-keys backup@loha.local > /etc/loha/keys/backup-priv.asc
# QUAN TRỌNG: copy /etc/loha/keys/backup-priv.asc vào USB encrypted + paper print
# Sau đó XÓA khỏi server. Server chỉ cần public key để encrypt.
sudo shred -u /etc/loha/keys/backup-priv.asc

# 4. Cài cron backup
sudo cp deploy/backup/backup-encrypted.sh /opt/loha/scripts/
sudo chmod +x /opt/loha/scripts/backup-encrypted.sh
sudo nano /etc/cron.d/loha-backup
# Nội dung:
# 0 2 * * * loha /opt/loha/scripts/backup-encrypted.sh >> /var/log/loha-backup.log 2>&1
```

### Trên Windows backup server local:
```powershell
# Cài OpenSSH server để rsync push được sang
# Cài cwRsync hoặc dùng WSL rsync
# Tạo user `backup` với SSH key auth
# Mở port 22 (chỉ trong LAN, KHÔNG expose internet)
```

Cập nhật env trên VPS:
```bash
# /etc/loha/app.env (thêm):
REMOTE_BACKUP_USER=backup
REMOTE_BACKUP_HOST=192.168.1.10   # IP Windows backup server (qua VPN/Wireguard)
REMOTE_BACKUP_PATH=/cygdrive/d/loha-backup
REMOTE_BACKUP_PORT=22
```

---

## 7. Checklist sau triển khai

Chạy từng item sau khi deploy xong:

### Authentication
- [ ] Login với password mới → success
- [ ] Login với password cũ (bcrypt) → success + tự rehash sang argon2
- [ ] Sai password 5 lần → tài khoản bị khóa 15 phút
- [ ] Captcha hiện sau 2 lần fail (nếu cấu hình Turnstile)
- [ ] Tài khoản TP/PTP/TBP bị bắt setup 2FA khi vào /settings/security
- [ ] Quét QR + nhập code → 2FA active + nhận 8 backup codes
- [ ] Lần login tiếp theo → bị bắt sang /login/2fa
- [ ] Backup code dùng 1 lần (verify không reuse)

### Session
- [ ] Cookie có flag `__Host-` (kiểm tra DevTools)
- [ ] `Secure; HttpOnly; SameSite=Strict`
- [ ] Session expires 8h, idle 30 phút
- [ ] Login từ Firefox sau Chrome → session Chrome bị revoke (UA mismatch)

### Encryption
- [ ] `psql -d phong_kinh_te -c "SELECT content FROM ihanoi_complaints LIMIT 1;"`
      → output: `enc:AQ...` (không phải plaintext)
- [ ] App đọc qua UI → hiển thị plaintext tiếng Việt OK
- [ ] Search citizen name → tìm được (trigram bidx work)

### Security headers
- [ ] `curl -I https://pkt-tranphu.vn` → có `Strict-Transport-Security`, `X-Frame-Options: DENY`, `Content-Security-Policy`
- [ ] [SSL Labs test](https://www.ssllabs.com/ssltest/) → A+ rating
- [ ] [securityheaders.com](https://securityheaders.com/) → A rating

### Backup
- [ ] `sudo -u loha /opt/loha/scripts/backup-encrypted.sh` → tạo file `.sql.gpg`
- [ ] File backup không decrypt được nếu thiếu private key
- [ ] Backup tự đồng bộ sang Windows local server
- [ ] Test restore: `gpg --decrypt backup.sql.gpg | psql -U pkt phong_kinh_te_test`

### Email alerts
- [ ] Đăng nhập từ device mới → nhận email cảnh báo (qua Resend)
- [ ] Đổi mật khẩu → nhận email confirm
- [ ] Tài khoản bị khóa → nhận email warning

### Monitoring
- [ ] `journalctl -u pkt-app -f` → app log không leak PII
- [ ] `/admin/audit` → super admin xem được hành động
- [ ] `/settings/security` → user xem được login history + devices

### Disaster recovery test
- [ ] Reboot server → service auto-start qua systemd
- [ ] Stop PostgreSQL → app báo lỗi gracefully (không crash)
- [ ] Khôi phục backup từ Windows local sang server staging → app chạy được

---

## Rotation key (12 tháng/lần)

Xem `docs/security-key-rotation.md` (chi tiết quy trình rotate `DATA_ENCRYPTION_KEY` với lazy re-encrypt).

---

## Liên hệ khẩn cấp

- Trưởng phòng: ____________
- Phó TP: ____________
- Đầu mối kỹ thuật: ____________
- Backup paper key: két sắt phòng TP + két sắt phòng PTP
