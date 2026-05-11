# System Architecture — App PKT Xã Trần Phú

**Cập nhật:** 2026-05-11 (sau Security Overhaul P1-P4)

---

## 1. Tổng quan kiến trúc

App là **Next.js 16 monolith** tự host trên VPS Ubuntu, với PostgreSQL trên cùng server (LUKS encrypted). Không dùng managed service (Vercel/Supabase) — đã chuyển sang self-host để kiểm soát dữ liệu.

```
┌─────────────────────────────────────────────────────────────────┐
│  User (Browser/Mobile)                                          │
└──────────────────────┬──────────────────────────────────────────┘
                       │ HTTPS (TLS 1.3)
┌──────────────────────▼──────────────────────────────────────────┐
│  Nginx (reverse proxy)                                          │
│  - TLS 1.3, OCSP stapling, HSTS                                 │
│  - Rate limit: auth 10/min, api 60/min                          │
│  - Security headers (CSP, X-Frame, HSTS)                        │
└──────────────────────┬──────────────────────────────────────────┘
                       │ localhost:3000
┌──────────────────────▼──────────────────────────────────────────┐
│  Next.js 16 App (systemd service)                               │
│                                                                 │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │  App Router     │  │  Server Actions  │  │  API Routes   │  │
│  │  (RSC + Client) │  │  (actions/*.ts)  │  │  (api/*.ts)   │  │
│  └────────┬────────┘  └────────┬─────────┘  └───────┬───────┘  │
│           │                    │                     │          │
│  ┌────────▼────────────────────▼─────────────────────▼────────┐ │
│  │                   Core Libraries (lib/)                    │ │
│  │                                                            │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │ │
│  │  │ lib/crypto/  │  │lib/security/ │  │  lib/session.ts │  │ │
│  │  │ - password   │  │ - login-prot │  │  lib/auth.ts    │  │ │
│  │  │ - policy     │  │ - request-fp │  │  lib/permissions│  │ │
│  │  │ - envelope   │  │ - totp       │  │                 │  │ │
│  │  │ - blind-idx  │  │ - device-trk │  │                 │  │ │
│  │  │ - field-ciph │  │ - email-alrt │  │                 │  │ │
│  │  └──────────────┘  └──────────────┘  └─────────────────┘  │ │
│  │                                                            │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │ │
│  │  │  lib/ai.ts   │  │  lib/rag*.ts │  │  lib/db.ts      │  │ │
│  │  │  (multi-prov)│  │  (hybrid RAG)│  │  (Prisma+ext)   │  │ │
│  │  └──────────────┘  └──────────────┘  └────────┬────────┘  │ │
│  └───────────────────────────────────────────────┼────────────┘ │
└─────────────────────────────────────────────────┼───────────────┘
                                                  │ TCP 5432
┌─────────────────────────────────────────────────▼───────────────┐
│  PostgreSQL 16 (trên LUKS encrypted volume /srv/data)           │
│  + pgvector extension                                           │
└─────────────────────────────────────────────────────────────────┘
                    │ pg_dump → GPG → rsync
┌───────────────────▼─────────────────────────────────────────────┐
│  Windows Backup Server (LAN)                                    │
│  Lưu file .sql.gpg (encrypted RSA-4096)                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Auth & Security Layer (P1-P4)

### 2.1 Login Flow

```
Browser → /login
  │
  ├─[1] Submit form (email + password + captchaToken?)
  │
  ▼ Server Action: loginAction()
  │
  ├─[2] Lockout check (checkLoginAllowed)
  │      - Xem DB: LoginAttempt + User.lockedUntil
  │      - If locked → return error + lockedUntil
  │
  ├─[3] failCount >= 2? → require Turnstile captcha
  │      - verifyCaptcha(token, ip) → Cloudflare API
  │
  ├─[4] Password verify (verifyPassword)
  │      - Detect bcrypt prefix → Argon2id verify + pepper
  │      - needsRehash? → rehashIfNeeded (migrate to Argon2id)
  │      - FAIL → recordFailedAttempt → return error
  │
  ├─[5] Create Better Auth session
  │      - Cookie: __Host- style, SameSite=Strict, HttpOnly, Secure (prod)
  │      - Binding: ipSubnet, userAgentHash, deviceId
  │
  ├─[6] Device tracking (recordDeviceLogin)
  │      - detectAnomalies: NEW_DEVICE, IMPOSSIBLE_TRAVEL, OFF_HOURS
  │      - logSecurityEvent nếu có anomaly
  │      - sendEmailAlert nếu NEW_DEVICE
  │
  ├─[7] require2FA(user.role)?
  │      └─ Yes (TP/PTP/TBP/SUPER_ADMIN)
  │          → session.twoFactorVerified = false
  │          → redirect /login/2fa
  │          → User nhập TOTP code hoặc backup code
  │          → session.twoFactorVerified = true
  │
  └─[8] mustChangePassword?
         └─ Yes → redirect /change-password
         └─ No  → redirect /dashboard
```

### 2.2 Session Validation (mỗi request)

```
Request → middleware.ts
  │
  └─ requireSession() → lib/session.ts
       │
       ├─ Lấy session token từ cookie
       ├─ findUnique by session.id (không findFirst by userId)
       ├─ Kiểm tra expiresAt (absolute 8h)
       ├─ Kiểm tra lastActivityAt (idle 30 phút)
       ├─ compareFingerprints(request, session)
       │    - IP subnet mismatch: score +1
       │    - UA hash mismatch: score +1
       │    - deviceId mismatch: score +1
       │    - score >= 2 → revoke session + logSecurityEvent
       ├─ Kiểm tra twoFactorVerified (nếu role bắt buộc 2FA)
       └─ Update session.lastActivityAt
```

### 2.3 Encryption Layer (P3)

```
Application Code
       │
       ▼  (Prisma query)
lib/db.ts  →  Prisma Client Extension (field-cipher.ts)
       │
       ├─ CREATE/UPDATE:
       │    Với mỗi field trong ENC_CONFIG:
       │    plaintext → encryptField(field, plaintext)
       │              → HKDF-SHA256(DATA_ENCRYPTION_KEY, "table.field.v1") → DEK
       │              → AES-256-GCM(DEK, iv, aad) → ciphertext
       │              → base64(version|iv|tag|ciphertext) → "enc:AQ..."
       │    Với blind index fields:
       │    plaintext → exactBidx(context, value) → HMAC-SHA256 → bidxValue
       │    plaintext → trigramBidx(context, value) → 3-gram array
       │
       ├─ FIND/SELECT:
       │    Với mỗi field trong ENC_CONFIG:
       │    "enc:AQ..." → decryptField(field, value) → plaintext
       │    (nếu không có prefix "enc:" → trả nguyên, backward compat)
       │
       └─ PostgreSQL lưu:
            citizenName = "enc:AQMnRkxY..." (ciphertext)
            citizenNameBidx = ["xyz", "abc", ...]  (trigram, không encrypt)
```

---

## 3. Layer diagram

```
┌─────────────────────────────────────────────────────────┐
│  Presentation Layer                                      │
│  app/(auth)/ | app/(dashboard)/ | app/(admin)/          │
│  components/ (React Server + Client Components)          │
└─────────────────────────┬───────────────────────────────┘
                          │ Server Actions / fetch
┌─────────────────────────▼───────────────────────────────┐
│  Application Layer                                       │
│  actions/*.ts (auth, task, password, two-factor,        │
│               security, ihanoi, tthc, ubnd, admin)      │
└─────────────────────────┬───────────────────────────────┘
                          │ lib/* calls
┌─────────────────────────▼───────────────────────────────┐
│  Domain Layer                                            │
│  lib/permissions.ts    — RBAC helpers                    │
│  lib/session.ts         — Session resolve + validation   │
│  lib/auth.ts            — Better Auth config             │
│  lib/ai.ts              — AI multi-provider              │
│  lib/rag*.ts            — Hybrid RAG pipeline            │
│  lib/ai-monitor/        — Risk scanner                   │
│  lib/ai-tools/          — Agent tools                    │
└─────────────────────────┬───────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────┐
│  Security Layer (NEW P1-P4)                              │
│  lib/security/login-protection.ts  — Lockout DB         │
│  lib/security/request-fingerprint.ts — Session binding  │
│  lib/security/totp.ts              — 2FA TOTP           │
│  lib/security/device-tracking.ts   — Anomaly detect     │
│  lib/security/email-alerts.ts      — Resend alerts      │
│  lib/security/captcha.ts           — Turnstile verify   │
│  lib/security/security-events.ts   — Event logging      │
│  lib/security/client-fingerprint.ts — Browser FP       │
└─────────────────────────┬───────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────┐
│  Crypto Layer (NEW P3)                                   │
│  lib/crypto/password.ts         — Argon2id + pepper     │
│  lib/crypto/password-policy.ts  — Password strength     │
│  lib/crypto/envelope.ts         — AES-256-GCM + HKDF    │
│  lib/crypto/blind-index.ts      — HMAC + trigram        │
│  lib/crypto/field-cipher.ts     — Prisma extension      │
└─────────────────────────┬───────────────────────────────┘
                          │ Prisma ORM
┌─────────────────────────▼───────────────────────────────┐
│  Data Layer                                              │
│  lib/db.ts (Prisma Client + field-cipher extension)     │
│  PostgreSQL 16 + pgvector (LUKS encrypted volume)       │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Database Schema — Mô hình dữ liệu

### Auth & Security models

```
User ─────────────── Session (7 binding fields)
  │                     │
  ├── PasswordHistory    │── TrustedDevice (FK trustedDeviceId)
  ├── LoginAttempt
  ├── TrustedDevice
  └── SecurityEvent
```

### Business models

```
Task ─── ProgressReport
  │   └── TaskNote
  │
  ├── (source) UBNDDirective
  ├── (source) IHanoiComplaint
  │
TaskGroup

TTHCRecord
WorkSchedule

LegalDocument ── (pgvector embedding)
ChatHistory / Conversation
Notification
AIAuditLog
AdminAuditLog
SystemSetting
```

### Encrypted fields (AES-256-GCM)

Xem chi tiết tại [codebase-summary.md](codebase-summary.md#blind-index-columns-mới-p3).

---

## 5. AI Architecture

### Multi-provider chain

```
Request → lib/ai.ts
  │
  ├─ Try: Gemini 2.5 Flash (Google)
  │       gemini-2.5-flash-preview-05-20
  ├─ Fallback: DeepSeek Chat (OpenAI compat)
  └─ Fallback: Claude claude-sonnet-4-6 (Anthropic)
```

### Hybrid RAG pipeline

```
User question
  │
  ├─[1] Article Expansion (lib/rag-article-expansion.ts)
  │      AI mở rộng câu hỏi → các điều khoản có thể liên quan
  │
  ├─[2] Vector search (pgvector cosine similarity)
  │      Gemini embedding → so sánh với LegalDocument embeddings
  │
  ├─[3] BM25 keyword search
  │      Fulltext search PostgreSQL
  │
  ├─[4] Scoring + rerank (lib/rag-scoring.ts)
  │      Kết hợp vector score + BM25 score + recency
  │
  └─[5] Generate answer với context
         Citations: Điều X, Khoản Y của NĐ/TT Z
```

### AI Agent tools

**Read tools (6):** `getMyTasks`, `getTaskDetails`, `getSchedule`, `getUBNDDirectives`, `getIHanoiComplaints`, `getTeamStatus`

**Write tools (5, có confirmation):** `createTask`, `updateTaskStatus`, `addProgressReport`, `createReminder`, `sendNotification`

Pattern: stateless dry-run → show preview → user confirm → execute.

---

## 6. Deploy Architecture (P4)

### Hiện tại: Demo local

```
Windows Dev Machine
  └── PostgreSQL 16 (port 5435)
  └── Next.js dev server (port 3000)
```

### Mục tiêu: VPS self-host

```
VPS Ubuntu 22.04 (IPv4 tĩnh)
  ├── Nginx (port 80/443) — TLS 1.3, rate limit
  ├── Next.js standalone (port 3000) — systemd service
  ├── PostgreSQL 16 — trên LUKS encrypted /srv/data
  └── Cron: backup 02:00 + risk-scan */30

    │ rsync (LAN qua Wireguard VPN)
    ▼
Windows Backup Server (nội bộ UBND)
  └── /d/loha-backup/*.sql.gpg
```

### Security hardening

| Layer | Biện pháp |
|-------|-----------|
| Disk | LUKS full-volume encryption cho /srv/data |
| OS | SSH key-only, custom port, UFW, fail2ban |
| App user | `loha` system user, no root, NoNewPrivileges |
| Service | ProtectSystem=strict, CapabilityBoundingSet minimal |
| Network | Nginx rate limit, Cloudflare proxy (optional) |
| Data at rest | AES-256-GCM per-field, backup GPG RSA-4096 |
| Data in transit | TLS 1.3 only, OCSP stapling, HSTS 2 năm |
| Headers | CSP, X-Frame-Options DENY, HSTS, Permissions-Policy |

Xem chi tiết: [security-deployment.md](security-deployment.md)

---

## 7. Middleware

`middleware.ts` xử lý:
1. Public routes (`/login`, `/login/2fa`, `/change-password`, `/api/auth/*`) — không cần auth
2. Protected routes — gọi `requireSession()`
3. 2FA gate — nếu role bắt buộc 2FA và `twoFactorVerified = false` → redirect `/login/2fa`
4. Force change password gate — nếu `mustChangePassword = true` → redirect `/change-password`

---

## 8. Environment topology

```
.env.local          — Dev secrets (gitignored)
.env                — Non-secret public config
/etc/loha/app.env   — Production secrets (chmod 0400, owner loha)
```

Không có `.env.example` committed — developer tự sinh keys qua `scripts/generate-encryption-keys.ts`.
