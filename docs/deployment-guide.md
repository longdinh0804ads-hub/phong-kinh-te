# Deployment Guide

**Dự án:** App Quản Lý Phòng Kinh Tế Xã Trần Phú
**Cập nhật:** 2026-05-11

---

## Mục lục

### Phần A — Deploy Vercel (Test/Staging)
- [A.1 Tổng quan kiến trúc Vercel](#a1-tổng-quan-kiến-trúc-vercel)
- [A.2 Setup Supabase Database](#a2-setup-supabase-database)
- [A.3 Push code lên GitHub](#a3-push-code-lên-github)
- [A.4 Import vào Vercel + Env vars](#a4-import-vào-vercel--env-vars)
- [A.5 Seed users + verify](#a5-seed-users--verify)
- [A.6 Cron setup trên Vercel](#a6-cron-setup-trên-vercel)
- [A.7 Giới hạn Hobby tier + khi nào upgrade Pro](#a7-giới-hạn-hobby-tier--khi-nào-upgrade-pro)
- [A.8 Gắn custom domain](#a8-gắn-custom-domain)

### Phần B — Deploy VPS (Production self-hosted)
1. [Yêu cầu hạ tầng](#1-yêu-cầu-hạ-tầng)
2. [PostgreSQL + pgvector Setup](#2-postgresql--pgvector-setup)
3. [Environment Variables](#3-environment-variables)
4. [Docker Compose Deploy](#4-docker-compose-deploy)
5. [Nginx + SSL](#5-nginx--ssl)
6. [Database Migration](#6-database-migration)
7. [Cron Setup (Risk Scanner)](#7-cron-setup-risk-scanner)
8. [Backup Strategy](#8-backup-strategy)
9. [Health Check & Monitoring](#9-health-check--monitoring)
10. [Troubleshooting](#10-troubleshooting)

---

# Phần A — Deploy Vercel (Test/Staging)

## A.1 Tổng quan kiến trúc Vercel

```
┌──────────────────┐         ┌─────────────────────┐
│  Vercel Edge     │         │  Supabase           │
│  (Next.js app)   │ ──────► │  PostgreSQL +       │
│  *.vercel.app    │         │  pgvector           │
└──────┬───────────┘         └─────────────────────┘
       │
       │ Cron */30 (Hobby: daily)
       ▼
   /api/cron/risk-scan
```

**Lưu ý hạn chế khi dùng Vercel:**
- **File upload**: Filesystem ephemeral. Avatar upload đã được disable trên Vercel (xem env `VERCEL=1` auto-detect trong code). User dùng initials làm avatar.
- **Function timeout**: Hobby 10s, Pro 60-300s. Chat AI dài (> 10s) sẽ timeout trên Hobby.
- **Cron**: Hobby chỉ chạy 1 lần/ngày; Pro flexible.

## A.2 Setup Supabase Database

1. Vào https://supabase.com → Sign up (GitHub login) → New Project
   - **Region**: chọn **Southeast Asia (Singapore)** — gần Vietnam nhất
   - **Database password**: tạo + lưu password mạnh
   - Plan: **Free**
2. Đợi DB ready (~2 phút)
3. **Bật pgvector extension**:
   - Dashboard → Database → Extensions
   - Search "vector" → toggle ON
4. **Lấy 2 connection URL**:
   - Dashboard → Settings → Database → Connection string
   - **Pooler (Transaction mode, port 6543)** — dùng cho `DATABASE_URL`:
     ```
     postgresql://postgres.<ref>:<password>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
     ```
   - **Direct (port 5432)** — dùng cho `DIRECT_DATABASE_URL` (Prisma migrate):
     ```
     postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres
     ```

## A.3 Push code lên GitHub

```bash
# Tại folder gốc dự án: F:\ALL DỰ ÁN\BAN KINH TẾ
cd "F:\ALL DỰ ÁN\BAN KINH TẾ"

# Init git (nếu chưa)
git init
git branch -M main

# Add files - .gitignore đã exclude node_modules, .env*, .next, .claude, plans
git add .
git status   # verify không thấy .env, .env.local, node_modules

# Commit
git commit -m "chore: prep for Vercel deploy"

# Tạo repo trên github.com (private hoặc public), rồi:
git remote add origin git@github.com:<your-username>/phong-kinh-te.git
git push -u origin main
```

**Cảnh báo:** Verify trước khi push:
```bash
# KHÔNG được thấy các file này trong staged:
git status | grep -E "\.env|node_modules|\.next|\.claude"
# Nếu thấy → xóa khỏi git, KHÔNG commit
```

## A.4 Import vào Vercel + Env vars

1. https://vercel.com → New Project → Import từ GitHub
2. Chọn repo `phong-kinh-te` (cấp quyền Vercel access nếu lần đầu)
3. Configure:
   - **Root Directory**: `app`  ⚠️ **quan trọng** (project nằm trong subfolder `app/`)
   - **Framework Preset**: Next.js (auto-detect)
   - **Build Command**: `prisma generate && next build` (Vercel tự thêm khi detect Prisma — verify)
   - **Install Command**: `npm install` (mặc định)
4. **Environment Variables** — add tất cả:

| Key | Value | Notes |
|---|---|---|
| `DATABASE_URL` | Supabase **pooler** URL (port 6543) | Connection cho runtime |
| `DIRECT_DATABASE_URL` | Supabase **direct** URL (port 5432) | Cho Prisma migrate |
| `BETTER_AUTH_SECRET` | Random 64 hex | `openssl rand -hex 32` |
| `BETTER_AUTH_URL` | `https://<project>.vercel.app` | Vercel domain (cập nhật sau khi deploy) |
| `NEXT_PUBLIC_APP_URL` | Same as above | Client-side URL |
| `GEMINI_API_KEYS` | Key Google AI Studio (1 hoặc nhiều, comma-separated) | Multi-key rotation |
| `DEEPSEEK_API_KEY` | Key DeepSeek (optional fallback) | |
| `ANTHROPIC_API_KEY` | Key Anthropic (optional) | |
| `SMTP_HOST` | `smtp.gmail.com` | Gmail Workspace |
| `SMTP_PORT` | `587` | |
| `SMTP_USER` | Email Gmail Workspace | |
| `SMTP_PASS` | App Password (16 ký tự) | KHÔNG dùng password chính |
| `SMTP_FROM` | Display sender | |
| `CRON_SECRET` | Random 64 hex | Vercel cron auto inject vào Authorization header |
| `DISABLE_AVATAR_UPLOAD` | `1` | (Optional) Vercel tự detect qua `VERCEL=1` |

5. Click **Deploy** → Vercel build ~3 phút.

**Sau deploy lần đầu:**
- Copy domain `https://<project>.vercel.app`
- Vào Settings → Environment Variables → update `BETTER_AUTH_URL` + `NEXT_PUBLIC_APP_URL` về đúng domain → Redeploy

## A.5 Seed users + verify

Vercel KHÔNG chạy `prisma db push` tự động (chỉ chạy `next build` + `prisma generate`). Phải push schema thủ công 1 lần đầu từ máy local:

```bash
cd "F:\ALL DỰ ÁN\BAN KINH TẾ\app"

# Tạm thay .env local cho trỏ tới Supabase
# Backup .env hiện tại:
cp .env .env.backup

# Tạo .env.production với 2 URL Supabase
cat > .env.production << 'EOF'
DATABASE_URL="<Supabase pooler URL>"
DIRECT_DATABASE_URL="<Supabase direct URL>"
EOF

# Push schema lên Supabase
npx prisma db push --schema=prisma/schema.prisma

# Seed 21 users
DATABASE_URL="<Supabase direct URL>" npx tsx prisma/seed.ts

# Khôi phục .env local
mv .env.backup .env
```

Verify:
- Vào https://<project>.vercel.app/login
- Login `tuan.vv@phongkinhte-tranphu.vn` / `ChangeMe@2026`
- Mở Vercel Dashboard → Project → Functions → xem logs nếu có error

## A.6 Cron setup trên Vercel

File `app/vercel.json` đã có config:
```json
{
  "crons": [{
    "path": "/api/cron/risk-scan",
    "schedule": "*/30 * * * *"
  }]
}
```

Vercel tự fire cron — KHÔNG cần external service.
- Vercel inject header `Authorization: Bearer $CRON_SECRET` (env var) → endpoint verify match.
- Xem log: Vercel Dashboard → Crons → Executions

## A.7 Giới hạn Hobby tier + khi nào upgrade Pro

| Giới hạn | Hobby (Free) | Pro ($20/month) |
|---|---|---|
| Function timeout | **10 giây** | 60s default, max 300s |
| Body size | 4.5 MB | 100 MB |
| Cron tần suất | **Daily only** | Mỗi phút |
| Bandwidth | 100 GB/tháng | 1 TB |
| Concurrent builds | 1 | 12 |

**Upgrade Pro nếu:**
- Chat AI thường > 10s (truy vấn pháp luật phức tạp)
- Parse PDF lớn (parse-pdf endpoint cần 300s)
- Cần cron 30 phút thực sự (Hobby chỉ 1 lần/ngày)
- > 100 user active tháng

## A.8 Gắn custom domain

1. Mua domain ở provider Vietnam (Mắt Bão / Nhân Hòa / PA Việt Nam) hoặc Namecheap
2. Vercel Dashboard → Project → Settings → Domains → Add `pkt-tranphu.gov.vn` (hoặc tên miền chọn)
3. Theo hướng dẫn Vercel: thêm DNS records (A hoặc CNAME) ở provider
4. SSL tự cấp Let's Encrypt (~5 phút)
5. **Quan trọng**: Update env vars trên Vercel:
   - `BETTER_AUTH_URL=https://<custom-domain>`
   - `NEXT_PUBLIC_APP_URL=https://<custom-domain>`
6. Redeploy → cookies bind sang domain mới → user phải login lại lần đầu

---

# Phần B — Deploy VPS (Production self-hosted)

---

## 1. Yêu cầu hạ tầng

| Thành phần | Yêu cầu tối thiểu | Khuyến nghị |
|------------|------------------|-------------|
| VPS | 2 CPU, 4GB RAM | 4 CPU, 8GB RAM |
| Storage | 20GB SSD | 50GB SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| Docker | 24+ | Docker 24+ |
| Domain | Tên miền thực | HTTPS bắt buộc |

**Lưu ý:** PostgreSQL không expose port ra internet. Nginx làm reverse proxy duy nhất nhận traffic ngoài.

---

## 2. PostgreSQL + pgvector Setup

Docker image chính thức đã có pgvector:

```yaml
# docker-compose.yml
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: pkt_user
      POSTGRES_PASSWORD: strong-password-here
      POSTGRES_DB: phong_kinh_te
    volumes:
      - postgres_data:/var/lib/postgresql/data
    # KHÔNG expose port 5432 ra ngoài
    networks:
      - internal
```

Kích hoạt extension trong migration đầu tiên (Prisma tự làm):

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

---

## 3. Environment Variables

### File `.env.production` (không commit vào git)

```bash
# Database
DATABASE_URL=postgresql://pkt_user:STRONG_PASSWORD@postgres:5432/phong_kinh_te

# Better Auth
BETTER_AUTH_SECRET=openssl-rand-base64-32-output  # >= 32 ký tự
BETTER_AUTH_URL=https://your-domain.vn
NEXT_PUBLIC_APP_URL=https://your-domain.vn

# AI Providers — chat (ít nhất 1 trong 3)
GEMINI_API_KEY=AIza...            # Google AI Studio — ưu tiên 1, cũng dùng cho embedding
GEMINI_API_KEYS=key1,key2,key3    # Nhiều keys: round-robin, override GEMINI_API_KEY
DEEPSEEK_API_KEY=sk-...           # platform.deepseek.com — ưu tiên 2
ANTHROPIC_API_KEY=sk-ant-...      # console.anthropic.com — ưu tiên 3

# AI Provider override (optional)
AI_PROVIDER=gemini                # Force dùng provider cụ thể, bỏ qua auto-detect

# Background Risk Scanner (bắt buộc nếu dùng cron)
CRON_SECRET=openssl-rand-hex-32-output  # Khác với BETTER_AUTH_SECRET
```

**Quan trọng:**
- `GEMINI_API_KEY`/`GEMINI_API_KEYS` dùng cho cả chat lẫn embedding
- `GEMINI_API_KEYS` có nhiều keys thì merge với `GEMINI_API_KEY` (nếu set)
- Thứ tự provider: AI_PROVIDER env → Gemini → DeepSeek → Anthropic

### Tạo secrets

```bash
openssl rand -base64 32   # BETTER_AUTH_SECRET
openssl rand -hex 32      # CRON_SECRET
```

---

## 4. Docker Compose Deploy

### Cấu trúc file

```
app/
├── Dockerfile
├── docker-compose.yml        # Development
├── docker-compose.prod.yml   # Production override
└── .env.production           # Secrets (không commit)
```

### Deploy lần đầu

```bash
cd /opt/phong-kinh-te/app

# Tạo .env.production
cp .env.example .env.production
nano .env.production   # Điền secrets thật

# Build và chạy
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Chạy migrations
docker compose exec nextjs npx prisma migrate deploy

# Seed users (chỉ lần đầu)
docker compose exec nextjs npx prisma db seed

# Thêm pgvector column
docker compose exec nextjs npx tsx scripts/add-embedding-column.ts
```

### Update (rolling deploy)

```bash
git pull origin main
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build nextjs
docker compose exec nextjs npx prisma migrate deploy
```

### Next.js `output: "standalone"`

`next.config.ts` đã cấu hình `output: "standalone"` — Docker image nhỏ hơn, không cần `node_modules` trong container.

---

## 5. Nginx + SSL

### Cấu hình cơ bản

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.vn;

    ssl_certificate /etc/letsencrypt/live/your-domain.vn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.vn/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # Security headers
    add_header X-Frame-Options SAMEORIGIN;
    add_header X-Content-Type-Options nosniff;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains";
    add_header Referrer-Policy "strict-origin-when-cross-origin";
    server_tokens off;

    # Rate limiting cho AI endpoints
    limit_req_zone $binary_remote_addr zone=ai:10m rate=10r/m;
    location /api/ai/ {
        limit_req zone=ai burst=5 nodelay;
        proxy_pass http://nextjs:3000;
        proxy_http_version 1.1;
        proxy_set_header Connection "";  # SSE: disable keep-alive chunking
    }

    location / {
        proxy_pass http://nextjs:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}

server {
    listen 80;
    server_name your-domain.vn;
    return 301 https://$server_name$request_uri;
}
```

### Lấy SSL certificate (Let's Encrypt)

```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d your-domain.vn
# Auto-renew đã được cấu hình qua systemd timer
```

---

## 6. Database Migration

### Migration workflow

```bash
# Development: tạo migration mới
npx prisma migrate dev --name "add-task-notes"

# Production: chỉ apply migration đã có
npx prisma migrate deploy

# Reset DB (NGUY HIỂM — chỉ dùng dev)
npx prisma migrate reset
```

### One-time scripts sau migrate

```bash
# Chạy sau khi nâng cấp từ phase 04 lên (nếu có chunks cũ)
npx tsx scripts/backfill-embeddings.ts

# Kiểm tra vector index
npx tsx scripts/add-embedding-column.ts  # Idempotent — an toàn chạy lại
```

---

## 7. Cron Setup (Risk Scanner)

Risk scanner chạy mỗi 30 phút qua external HTTP GET.

### Option A: cron-job.org (khuyến nghị cho VPS)

1. Vào [cron-job.org](https://cron-job.org), tạo account
2. Tạo cron job:
   - URL: `https://your-domain.vn/api/cron/risk-scan?secret=CRON_SECRET`
   - Schedule: `*/30 * * * *` (mỗi 30 phút)
   - Method: GET

### Option B: Server cron (nếu tự host)

```bash
# Thêm vào crontab
crontab -e

# Mỗi 30 phút
*/30 * * * * curl -s "https://your-domain.vn/api/cron/risk-scan?secret=CRON_SECRET" > /dev/null
```

### Option C: Vercel Cron (nếu deploy lên Vercel)

```json
// vercel.json
{
  "crons": [{
    "path": "/api/cron/risk-scan",
    "schedule": "*/30 * * * *"
  }]
}
```

**Xem hướng dẫn chi tiết:** [app/docs/ai-monitor-cron.md](../app/docs/ai-monitor-cron.md)

---

## 8. Backup Strategy

### PostgreSQL backup hàng ngày

Docker compose đã có `backup` service:

```yaml
# docker-compose.prod.yml
services:
  backup:
    image: postgres:16
    environment:
      PGPASSWORD: ${DB_PASSWORD}
    volumes:
      - ./backups:/backups
    command: >
      sh -c "while true; do
        pg_dump -h postgres -U pkt_user phong_kinh_te
        | gzip > /backups/backup_$$(date +%Y%m%d_%H%M%S).sql.gz;
        find /backups -name '*.sql.gz' -mtime +30 -delete;
        sleep 86400;
      done"
    depends_on:
      - postgres
```

Backup lưu tại `./backups/` trên host. Retention: 30 ngày.

### Restore

```bash
gunzip -c backups/backup_20260511_020000.sql.gz | \
  docker compose exec -T postgres psql -U pkt_user phong_kinh_te
```

### File uploads (PDF văn bản pháp lý)

```bash
# Backup thủ công hoặc cron
tar -czf uploads_$(date +%Y%m%d).tar.gz ./uploads/
```

---

## 9. Health Check & Monitoring

### Docker healthcheck

```bash
docker compose ps          # Xem status tất cả containers
docker compose logs nextjs # Xem logs Next.js
docker compose logs -f nextjs --tail 100  # Follow logs
```

### App health endpoint

```bash
curl https://your-domain.vn/api/health
# Response: { "status": "ok", "db": "connected" }
```

### AI availability check

```bash
curl https://your-domain.vn/api/ai/status
# Response: { "available": true }
# KHÔNG tiết lộ provider/model
```

---

## 10. Troubleshooting

### AI không hoạt động

```bash
# Kiểm tra keys
docker compose exec nextjs npx tsx scripts/test-embedding.ts
docker compose exec nextjs npx tsx scripts/test-agent.ts
```

### RAG không trả kết quả

```bash
docker compose exec nextjs npx tsx scripts/diagnose-rag.ts "câu hỏi test"
```

### Risk scanner không gửi notification

```bash
# Test trực tiếp
docker compose exec nextjs npx tsx scripts/test-risk-scanner.ts

# Kiểm tra logs cron
docker compose logs nextjs | grep "risk-scan"
```

### Database connection fail

```bash
docker compose exec nextjs npx prisma db pull  # Test kết nối
docker compose logs postgres                    # Xem DB logs
```

### Permission issues sau update

```bash
docker compose exec nextjs npx tsx scripts/test-rbac.ts
```
