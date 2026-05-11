# Codebase Summary — App PKT Xã Trần Phú

**Cập nhật:** 2026-05-11 (sau Security Overhaul P1-P4)

---

## Tổng quan cấu trúc

```
app/
├── app/                    # Next.js App Router routes
│   ├── (auth)/             # Login, 2FA, change-password
│   ├── (dashboard)/        # Các trang chính (task, UBND, TTHC, iHanoi, AI, settings)
│   ├── (admin)/            # Admin panel (SUPER_ADMIN)
│   └── api/                # API routes (Better Auth, cron, AI streaming)
├── actions/                # Server Actions (Next.js)
├── components/             # React components
├── lib/                    # Core libraries
│   ├── crypto/             # Mã hóa (P3) — 5 files
│   ├── security/           # Bảo mật auth (P1-P2) — 8 files
│   ├── ai-monitor/         # Risk scanner
│   ├── ai-tools/           # AI agent tools
│   └── validations/        # Zod schemas
├── prisma/                 # Schema + migrations + seed
├── scripts/                # Dev/ops scripts (~45 files)
├── deploy/                 # VPS config (nginx, systemd, backup)
└── docs/                   # Documentation
```

---

## Module chi tiết

### `lib/crypto/` — Lớp mã hóa (P3, mới hoàn thành)

| File | Chức năng |
|------|-----------|
| `password.ts` | Argon2id hash/verify + bcrypt legacy detection + pepper HMAC-SHA256. Export: `hashPassword`, `verifyPassword` (trả `needsRehash`), `rehashIfNeeded`. |
| `password-policy.ts` | Kiểm tra độ mạnh password. Reject: < 12 ký tự, < 3/4 nhóm complexity, common passwords, chứa email/tên, sequential chars, repeated chars. Export: `checkPasswordStrength`. |
| `envelope.ts` | AES-256-GCM envelope encryption với HKDF-SHA256 per-field DEK. Format lưu DB: `enc:` + base64(version|iv|tag|ciphertext). Export: `encryptField`, `decryptField`. |
| `blind-index.ts` | Blind index cho phép search trên ciphertext. Exact (HMAC-SHA256) cho phone lookup, Trigram (3-gram) cho name fuzzy search. Export: `exactBidx`, `trigramBidx`. |
| `field-cipher.ts` | Prisma Client Extension — transparent encrypt/decrypt qua `$allModels`. Config `ENC_CONFIG` định nghĩa fields nào được encrypt per-model. |

### `lib/security/` — Lớp bảo mật auth (P1-P2, mới hoàn thành)

| File | Chức năng |
|------|-----------|
| `login-protection.ts` | Lockout DB-backed: 5 fail/15min → lock 15m, 10 fail/1h → lock đến admin mở, 20 fail/1h/IP → block IP 24h. Export: `checkLoginAllowed`, `recordFailedAttempt`, `resetFailedAttempts`. |
| `request-fingerprint.ts` | Server-side fingerprint từ IP, User-Agent, Accept-Language. Export: `getFingerprint`, `compareFingerprints` (trả `score`). |
| `security-events.ts` | Ghi log SecurityEvent vào DB. Export: `logSecurityEvent(userId, type, meta)`. |
| `captcha.ts` | Verify Cloudflare Turnstile token phía server. Export: `verifyCaptcha(token, ip)`. |
| `client-fingerprint.ts` | Client-side fingerprint: canvas + WebGL + screen + timezone + fonts → SHA-256, cache localStorage. Export: React hook `useClientFingerprint`. |
| `totp.ts` | TOTP secret generation (AES-256-GCM encrypted, dùng system-settings key), QR code PNG, backup codes (8 codes × 10 ký tự, hash HMAC-SHA256). Export: `generateTOTPSecret`, `verifyTOTP`, `generateBackupCodes`. |
| `device-tracking.ts` | Record mỗi device login vào TrustedDevice. Detect anomalies: new device, impossible travel, off-hours. Export: `recordDeviceLogin`, `detectAnomalies`, `trustDevice`. |
| `email-alerts.ts` | Resend email alerts tiếng Việt: NEW_DEVICE, ACCOUNT_LOCKED, PASSWORD_CHANGED, 2FA_ENABLED. Export: `sendEmailAlert(type, user, meta)`. |

### `lib/` — Core libraries

| File | Chức năng |
|------|-----------|
| `auth.ts` | Better Auth config: session 8h, idle 30min, cookie `__Host-` style, session binding |
| `session.ts` | `getCurrentSession()`, `requireSession()`, fingerprint verification, idle check, 2FA check |
| `permissions.ts` | `hasPermission`, `isTopLeader`, `isDeptManager`, `isStaff`, `getManagedDepartments` |
| `db.ts` | Prisma client với `field-cipher` extension applied |
| `ai.ts` | Multi-provider AI: Gemini → DeepSeek → Anthropic fallback chain |
| `rag*.ts` | Hybrid RAG pipeline: article expansion, vector search, BM25, scoring |
| `system-settings.ts` | Key-value store cho system config (TOTP secret encryption key, v.v.) |
| `api-key-*.ts` | API key rotation, health check, usage tracking cho AI providers |

### `actions/` — Server Actions

| File | Chức năng |
|------|-----------|
| `auth.ts` | `loginAction`: lockout check → captcha verify → password verify → rehash if needed → session create → device track → anomaly check |
| `password.ts` | `changePasswordAction`: verify current pw → policy check → history check → hash → save → email alert |
| `two-factor.ts` | `setup2FA`, `enable2FA`, `verify2FA`, `disable2FA`, `verifyBackupCode` |
| `security.ts` | `trustDevice`, `revokeDevice`, `revokeSession`, `getSecurityOverview` |
| `task.ts` | CRUD task + workflow transitions: `startTask`, `submitTask`, `confirmTask`, `rejectTask`, `cancelTask` |
| `admin.ts` | User management, force reset password, unlock account, system settings |
| `ihanoi.ts` | CRUD iHanoi complaint (fields tự động encrypt qua Prisma extension) |
| `tthc.ts` | CRUD TTHC record |
| `ubnd.ts` | CRUD UBND directive |
| `task-note.ts` | CRUD TaskNote (lời nhắn lãnh đạo) |
| `conversation.ts` | AI conversation management |
| `legal.ts` | Legal document upload + RAG indexing |
| `schedule.ts` | Work schedule CRUD |
| `notification.ts` | Mark read, clear notifications |

### `app/(auth)/` — Auth routes (mới)

| Route | Chức năng |
|-------|-----------|
| `/login` | Form login + Turnstile captcha (hiện sau 2 fail) |
| `/login/2fa` | 2FA TOTP challenge sau khi pass password |
| `/change-password` | Force change password (khi `mustChangePassword = true`) |

### `app/(dashboard)/settings/security/` — Security UI (mới)

Trang `/settings/security` bao gồm:
- Setup/disable 2FA TOTP (QR code + backup codes)
- Danh sách TrustedDevice (xem + thu hồi)
- Danh sách Sessions active (xem + thu hồi)
- Login history (SecurityEvent log)

### `components/settings/` — Security components (mới)

| File | Chức năng |
|------|-----------|
| `two-factor-section.tsx` | UI setup 2FA: QR scan, code input, backup codes download |
| `devices-list.tsx` | Danh sách thiết bị đã đăng nhập, nút trust/revoke |
| `sessions-list.tsx` | Sessions active, nút revoke |
| `login-history.tsx` | Lịch sử đăng nhập từ SecurityEvent |
| `change-password-form.tsx` | Form đổi mật khẩu (password strength indicator) |

### `components/auth/` — Auth components (mới)

| File | Chức năng |
|------|-----------|
| `turnstile-widget.tsx` | Cloudflare Turnstile widget, auto-show sau 2 fail login |

### `deploy/` — VPS config (P4, mới)

| File | Chức năng |
|------|-----------|
| `nginx/pkt-tranphu.conf` | Nginx TLS 1.3, OCSP stapling, rate limit auth (10/min) + API (60/min) |
| `systemd/pkt-app.service` | Systemd hardened: NoNewPrivileges, ProtectSystem=strict, capability limits |
| `backup/backup-encrypted.sh` | pg_dump → GPG encrypt (public key) → rsync Windows local server |

### `scripts/` — Dev/ops scripts

**Security scripts (mới):**
- `generate-encryption-keys.ts` — Sinh `DATA_ENCRYPTION_KEY`, `BLIND_INDEX_KEY`, `PASSWORD_PEPPER`, `BETTER_AUTH_SECRET`, `CRON_SECRET`
- `backfill-encrypt.ts` — Encrypt data cũ: dry-run mode + idempotent + batch 50, skip nếu đã có `enc:`
- `create-super-admin.ts` — Tạo SUPER_ADMIN account lần đầu trên VPS
- `verify-encrypted-data.ts` — Kiểm tra DB đã encrypt đúng chưa

**Test scripts security (mới):**
- `test-password.ts` — Argon2id hash/verify + bcrypt migration
- `test-password-policy.ts` — 10 case policy
- `test-login-protection.ts` — Lockout DB-backed
- `test-totp.ts` — TOTP + backup codes 1-time
- `test-field-encryption.ts` — Encrypt/decrypt field + blind index
- `test-fingerprint.ts` — Device fingerprint stable
- `test-2fa-flow.ts` — 2FA end-to-end
- `test-login-e2e.ts` — Login flow đầy đủ

**Test scripts nghiệp vụ:**
- `test-rbac.ts` — 53/53 permission cases
- `test-review-workflow.ts` — 22/22 workflow transitions
- `test-risk-scanner.ts`, `test-agent.ts`, `test-write-tools.ts`, v.v.

---

## Database Schema — Models chính

### Models mới (P1-P4)

| Model | Fields chính | Mục đích |
|-------|-------------|---------|
| `PasswordHistory` | `userId`, `passwordHash`, `createdAt` | Lưu 5 hash gần nhất, chống reuse |
| `LoginAttempt` | `userId?`, `ipAddress`, `success`, `failReason`, `deviceId` | Audit trail login |
| `TrustedDevice` | `userId`, `deviceId`, `deviceName`, `trustedAt`, `lastSeenAt` | Device trust management |
| `SecurityEvent` | `userId`, `type`, `severity`, `ipAddress`, `metadata` | Log anomalies, lockout, 2FA events |

### Trường mới trong User (P1-P2)

```
passwordChangedAt, failedLoginCount, lockedUntil, lockReason
twoFactorSecret, twoFactorEnabled, twoFactorBackupCodes
lastActivityAt, mustChangePassword
phoneBidx (blind index cho user.phone — P3)
```

### Trường mới trong Session (P1)

```
deviceId, deviceName, trustedDeviceId, ipSubnet, userAgentHash
lastActivityAt, twoFactorVerified
```

### Blind index columns mới (P3)

| Model | Column | Loại |
|-------|--------|------|
| `User` | `phoneBidx` | Exact HMAC |
| `IHanoiComplaint` | `citizenPhoneBidx`, `citizenNameBidx[]` | Exact + Trigram |
| `TTHCRecord` | `applicantPhoneBidx`, `applicantNameBidx[]` | Exact + Trigram |

---

## Env Variables

### Development (`.env.local`)

```bash
DATABASE_URL=postgresql://...
DIRECT_DATABASE_URL=postgresql://...
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
GEMINI_API_KEY=
DATA_ENCRYPTION_KEY=           # 64 hex chars
BLIND_INDEX_KEY=               # 64 hex chars
PASSWORD_PEPPER=               # 64 hex chars
CRON_SECRET=                   # 64 hex chars
# Optional dev:
TURNSTILE_SECRET_KEY=
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
```

### Production (thêm)

```bash
APP_NAME=PKT Trần Phú
APP_URL=https://pkt-tranphu.vn
RESEND_API_KEY=
RESEND_FROM_EMAIL=no-reply@pkt-tranphu.vn
TURNSTILE_SECRET_KEY=          # Bắt buộc prod
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
REMOTE_BACKUP_USER=backup
REMOTE_BACKUP_HOST=192.168.1.10
REMOTE_BACKUP_PATH=/d/loha-backup
REMOTE_BACKUP_PORT=22
```

---

## Test Results (2026-05-11)

| Test suite | Kết quả |
|-----------|---------|
| Argon2id hash/verify + bcrypt migration | PASS |
| Password policy 10 case | PASS |
| Lockout DB-backed 5 fail → 15min | PASS |
| Device fingerprint stable same browser | PASS |
| TOTP encrypt/decrypt + backup codes 1-time | PASS |
| Field encryption: DB `enc:AQ...`, app plaintext | PASS |
| Blind index exact + trigram search | PASS |
| Backfill idempotent (skip existing) | PASS |
| Security headers: HSTS + CSP + X-Frame | PASS |
| Build clean: 40 routes | PASS |
| RBAC matrix | 53/53 |
| Task review workflow | 22/22 |
