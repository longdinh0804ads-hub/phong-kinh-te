# App Quản Lý Phòng Kinh Tế Xã Trần Phú

Hệ thống quản lý nội bộ cho **Phòng Kinh Tế Xã Trần Phú, TP Hà Nội** — phục vụ 21 cán bộ.

> **Trạng thái:** Demo local (port 5435). Chuẩn bị deploy VPS Ubuntu (xem [docs/deployment-guide.md](docs/deployment-guide.md)).

## Tech Stack

| Thành phần | Công nghệ |
|------------|-----------|
| Framework | Next.js 16 App Router + TypeScript |
| Database | PostgreSQL 16 + pgvector |
| ORM | Prisma 6 |
| Auth | Better Auth + Argon2id + 2FA TOTP |
| Crypto | AES-256-GCM envelope encryption + HKDF + blind index |
| UI | shadcn/ui + Tailwind CSS v4 |
| AI Chat | Gemini 2.5 Flash / DeepSeek / Claude Sonnet |
| AI Embed | Gemini `gemini-embedding-001` (768 dim) |
| Email | Resend (transactional alerts) |
| Captcha | Cloudflare Turnstile |
| Deploy | VPS Ubuntu 22.04 + Nginx TLS 1.3 + systemd |

## Quick Start

### 1. Yêu cầu
- Node.js 20+
- PostgreSQL 16 với pgvector extension (local: port 5435)

### 2. Setup môi trường

```bash
cp .env.example .env.local
# Chỉnh sửa .env.local với các giá trị thực
```

Biến bắt buộc cho dev:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5435/phong_kinh_te_dev
DIRECT_DATABASE_URL=postgresql://postgres:postgres@localhost:5435/phong_kinh_te_dev
BETTER_AUTH_SECRET=dev-secret-min-32-chars
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
GEMINI_API_KEY=your-gemini-api-key
# Security keys (sinh bằng scripts/generate-encryption-keys.ts)
DATA_ENCRYPTION_KEY=<64-hex>
BLIND_INDEX_KEY=<64-hex>
PASSWORD_PEPPER=<64-hex>
```

### 3. Database setup

```bash
npm install
npx prisma db push                                 # Tạo/sync tables
npx prisma db seed                                 # Seed 21 users
npx tsx scripts/add-embedding-column.ts            # Thêm vector column (lần đầu)
npx tsx scripts/generate-encryption-keys.ts        # Sinh crypto keys
```

### 4. Chạy dev server

```bash
npm run dev
# Mở http://localhost:3000
```

## Tính năng chính

### Quản lý công việc (workflow xác nhận TP)
- Giao việc top-down theo RBAC 5 cấp
- State machine: `PENDING → IN_PROGRESS → AWAITING_REVIEW → COMPLETED`
- TP/PTP nghiệm thu — assignee không tự đóng task
- Sub-tasks, lời nhắn lãnh đạo (TaskNote), nguồn nhiệm vụ (nội bộ / UBND / iHanoi)
- Background risk scanner (cron 30 phút, 7 loại rủi ro)

### Nghiệp vụ hành chính
- Chỉ đạo UBND: nhập → giao → phản hồi → theo dõi
- Phản ánh iHanoi: nhập thủ công, giao xử lý
- Hồ sơ TTHC: tiếp nhận → xử lý → hoàn thành / trả lại
- Lịch công tác tuần/tháng + báo cáo tổng hợp + xuất CSV

### Trợ lý AI pháp lý
- Hybrid RAG: Article Expansion → Vector + BM25 → BM25 fallback
- AI Agent: 6 read tools + 5 write tools (có xác nhận)
- Multi-provider: Gemini 2.5 Flash (ưu tiên) → DeepSeek → Anthropic

### Bảo mật (Security Overhaul P1-P4 — hoàn thành 2026-05-11)
- **P1:** Argon2id + pepper, password policy 12 ký tự, lockout DB-backed, Turnstile captcha, session binding IP/UA/deviceId
- **P2:** 2FA TOTP bắt buộc cho TP/PTP/TBP/SUPER_ADMIN, TrustedDevice, anomaly detection, email alerts Resend
- **P3:** Field-level envelope encryption AES-256-GCM, blind index (exact + trigram), transparent Prisma extension
- **P4:** Security headers (HSTS/CSP/X-Frame), Nginx TLS 1.3, systemd hardening, GPG encrypted backup

## Tài khoản test (5 role mẫu)

Mật khẩu mặc định: `ChangeMe@2026` (bắt buộc đổi — password policy: min 12 ký tự, 3/4 complexity)

> **Lưu ý:** TP/PTP/TBP sẽ bị yêu cầu setup 2FA TOTP sau lần đăng nhập đầu tiên.

| Email | Vai trò | Ghi chú |
|-------|---------|---------|
| `vu.van.tuan@tranphu.gov.vn` | TRUONG_PHONG | Toàn quyền hệ thống |
| `tran.tuan.minh@tranphu.gov.vn` | PHO_TP | Gần như TP |
| `vu.huy.tu@tranphu.gov.vn` | TRUONG_BO_PHAN | BP Tài chính - Kế hoạch |
| `nguyen.danh.hung@tranphu.gov.vn` | CHUYEN_VIEN | Tổ 1 |
| `nguyen.thi.dung@tranphu.gov.vn` | NHAN_VIEN | Thủ quỹ, quyền tối thiểu |

## RBAC — 5 cấp quyền

| Role | Mô tả |
|------|-------|
| `TRUONG_PHONG` | Toàn quyền hệ thống, bắt buộc 2FA |
| `PHO_TP` | Gần như TP, bắt buộc 2FA |
| `TRUONG_BO_PHAN` | Quyền trong bộ phận, bắt buộc 2FA |
| `CHUYEN_VIEN` | Task được giao + workflow assignee + AI full |
| `NHAN_VIEN` | Task của mình + lịch cá nhân + AI giới hạn |

## Scripts

```bash
# Setup & Keys
npx tsx scripts/generate-encryption-keys.ts     # Sinh crypto keys production
npx tsx scripts/backfill-encrypt.ts --dry        # Preview encrypt data cũ
npx tsx scripts/backfill-encrypt.ts              # Thực hiện backfill encrypt

# Test suite (security)
npx tsx scripts/test-password.ts                 # Test Argon2id hash/verify
npx tsx scripts/test-password-policy.ts          # Test policy 10 case
npx tsx scripts/test-login-protection.ts         # Test lockout DB-backed
npx tsx scripts/test-totp.ts                     # Test TOTP + backup codes
npx tsx scripts/test-field-encryption.ts         # Test encrypt/decrypt DB
npx tsx scripts/test-fingerprint.ts              # Test device fingerprint
npx tsx scripts/test-2fa-flow.ts                 # Test 2FA end-to-end
npx tsx scripts/test-login-e2e.ts                # Test login flow đầy đủ

# Test suite (nghiệp vụ)
npx tsx scripts/test-rbac.ts                     # Test 53 permission case
npx tsx scripts/test-review-workflow.ts          # Test task workflow 22 case
npx tsx scripts/test-risk-scanner.ts             # Test risk scanner
npx tsx scripts/test-agent.ts                    # Test AI agent tools
npx tsx scripts/diagnose-rag.ts                  # Debug RAG
```

## Background Cron (Risk Scanner)

```
GET /api/cron/risk-scan?secret=<CRON_SECRET>
# Hoặc: Authorization: Bearer <CRON_SECRET>
```

Xem chi tiết: [docs/ai-monitor-cron.md](docs/ai-monitor-cron.md)

## Tài liệu

| Tài liệu | Mô tả |
|----------|-------|
| [docs/project-overview-pdr.md](docs/project-overview-pdr.md) | Tổng quan dự án & PDR |
| [docs/system-architecture.md](docs/system-architecture.md) | Kiến trúc hệ thống |
| [docs/codebase-summary.md](docs/codebase-summary.md) | Tóm tắt codebase |
| [docs/code-standards.md](docs/code-standards.md) | Chuẩn code & patterns |
| [docs/project-roadmap.md](docs/project-roadmap.md) | Lộ trình phát triển |
| [docs/deployment-guide.md](docs/deployment-guide.md) | Hướng dẫn deploy VPS |
| [docs/security-deployment.md](docs/security-deployment.md) | Chi tiết bảo mật deploy |
| [docs/ai-monitor-cron.md](docs/ai-monitor-cron.md) | Cron risk scanner setup |
