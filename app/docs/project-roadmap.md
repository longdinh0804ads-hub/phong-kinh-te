# Project Roadmap — App PKT Xã Trần Phú

**Cập nhật:** 2026-05-11

---

## Tổng quan tiến độ

| Phase | Tên | Trạng thái | Hoàn thành |
|-------|-----|-----------|-----------|
| 01 | Foundation | **DONE** | 2026-05-09 |
| 02 | Task Management | **DONE** | 2026-05-11 |
| 03 | Reporting & UBND | **DONE** | 2026-05-11 |
| 04 | AI Legal Assistant | **DONE** | 2026-05-11 |
| SEC | Security Overhaul P1-P4 | **DONE** | 2026-05-11 |
| 05 | VPS Deploy & Polish | **IN PROGRESS** | — |

---

## Phase 01 — Foundation (DONE)

- [x] Next.js 16 App Router + TypeScript setup
- [x] PostgreSQL 16 + Prisma schema (13 base models)
- [x] Better Auth session-based auth
- [x] RBAC 5 cấp (TRUONG_PHONG, PHO_TP, TRUONG_BO_PHAN, CHUYEN_VIEN, NHAN_VIEN)
- [x] Seed 21 users (dữ liệu thực tế Phòng Kinh Tế)
- [x] UI shell: sidebar, header, layout responsive
- [x] shadcn/ui + Tailwind CSS v4 + Noto Sans

---

## Phase 02 — Task Management (DONE)

- [x] Task CRUD với RBAC scope
- [x] Workflow 4 bước: PENDING → IN_PROGRESS → AWAITING_REVIEW → COMPLETED
- [x] TP/PTP nghiệm thu (confirm/reject) — assignee không tự đóng
- [x] Sub-tasks
- [x] ProgressReport
- [x] TaskNote (lời nhắn lãnh đạo, ghim)
- [x] TaskSource: INTERNAL / UBND_DIRECTIVE / IHANOI
- [x] Thông báo realtime (Bell popup)
- [x] RBAC test: 53/53 pass
- [x] Workflow test: 22/22 pass

---

## Phase 03 — Reporting & UBND (DONE)

- [x] Chỉ đạo UBND: nhập, phân công, theo dõi, phản hồi
- [x] Phản ánh iHanoi: nhập thủ công, giao xử lý
- [x] Hồ sơ TTHC: tiếp nhận → xử lý → hoàn thành/trả lại
- [x] Lịch công tác tuần/tháng
- [x] Báo cáo tổng hợp + xuất CSV
- [x] Background risk scanner (cron 30 phút, 7 loại rủi ro)

---

## Phase 04 — AI Legal Assistant (DONE)

- [x] Hybrid RAG: Article Expansion → Vector + BM25
- [x] pgvector integration (Gemini embeddings 768 dim)
- [x] PDF upload + OCR parsing + indexing
- [x] AI Agent: 6 read tools + 5 write tools (confirmation pattern)
- [x] Multi-provider fallback: Gemini → DeepSeek → Anthropic
- [x] Conversation history context
- [x] API key rotation + health monitoring
- [x] AIAuditLog

---

## Security Overhaul P1-P4 (DONE — 2026-05-11)

Đây là phase bảo mật toàn diện thực hiện sau Phase 04, trước khi deploy production.

### P1 — Auth & Session Hardening (DONE)
- [x] Password: bcrypt → Argon2id (m=19MiB, t=2, p=1) + pepper HMAC-SHA256
- [x] Soft migration: verifyPassword detect bcrypt prefix, auto-rehash
- [x] Password policy: 12 chars, 3/4 complexity, no common, no email/name
- [x] PasswordHistory: chặn reuse 5 hash gần nhất
- [x] Lockout DB-backed: 5/15min, 10/1h, 20 IP/1h
- [x] Turnstile captcha sau 2 lần fail
- [x] Cookie: `__Host-` style, SameSite=Strict, HttpOnly, Secure
- [x] Session binding: IP /24 + UA hash + deviceId
- [x] Session: absolute 8h + idle 30 phút

### P2 — 2FA + Device + Email (DONE)
- [x] 2FA TOTP (`otpauth`): secret AES-256-GCM encrypted
- [x] Backup codes: 8 codes × 10 ký tự, hash HMAC-SHA256, 1 lần dùng
- [x] Bắt buộc 2FA: SUPER_ADMIN, TRUONG_PHONG, PHO_TP, TRUONG_BO_PHAN
- [x] `/login/2fa` trang riêng + `/change-password` + `/settings/security`
- [x] Client fingerprint: canvas + WebGL + timezone → SHA-256
- [x] TrustedDevice model + UI trust/revoke
- [x] Anomaly: new device, impossible travel, off-hours
- [x] Email alerts Resend: NEW_DEVICE, ACCOUNT_LOCKED, PASSWORD_CHANGED, 2FA_ENABLED
- [x] SecurityEvent model + login history UI

### P3 — Field-level Encryption (DONE)
- [x] Envelope encryption: AES-256-GCM + HKDF per-field DEK
- [x] Prisma Client Extension transparent (lib/crypto/field-cipher.ts)
- [x] Encrypt 20+ fields trên 8 models
- [x] Blind index exact (HMAC-SHA256): phone lookup
- [x] Blind index trigram (3-gram): name fuzzy search
- [x] Backfill script: dry-run + idempotent + batch 50
- [x] Backfill 100 records test OK

### P4 — VPS Config & Headers (DONE)
- [x] Security headers: HSTS, CSP, X-Frame-Options, Permissions-Policy
- [x] `deploy/nginx/pkt-tranphu.conf`: TLS 1.3, OCSP, rate limit
- [x] `deploy/systemd/pkt-app.service`: hardened systemd
- [x] `deploy/backup/backup-encrypted.sh`: GPG + rsync Windows
- [x] `docs/security-deployment.md`: guide 7 bước LUKS + deploy

---

## Phase 05 — VPS Deploy & Polish (IN PROGRESS)

### 5.1 VPS Deploy (TODO)
- [ ] Mua VPS Ubuntu 22.04 (4 vCPU, 8 GB RAM, 80 GB SSD)
- [ ] Đăng ký domain (ưu tiên `.vn`)
- [ ] Hardening OS: SSH key, UFW, fail2ban
- [ ] LUKS encryption cho data volume
- [ ] Cài PostgreSQL 16 + pgvector trên LUKS volume
- [ ] Deploy app với systemd service
- [ ] Nginx config + Let's Encrypt TLS
- [ ] Setup Resend domain verification
- [ ] Setup Turnstile domain whitelist
- [ ] Sinh production keys (`generate-encryption-keys.ts`)
- [ ] Lưu paper key (két sắt TP + PTP)
- [ ] Migrate data từ demo local (backfill-encrypt)
- [ ] Setup backup cron + test restore
- [ ] Kết nối Windows backup server qua Wireguard VPN
- [ ] Checklist post-deploy (xem security-deployment.md §7)

### 5.2 Windows Backup Server (TODO)
- [ ] Cài OpenSSH server trên Windows UBND
- [ ] Tạo user `backup` + SSH key auth
- [ ] Test rsync từ VPS vào Windows
- [ ] Verify backup decrypt: `gpg --decrypt | psql`

### 5.3 Polish & Onboarding (TODO)
- [ ] Onboarding 21 users: hướng dẫn đăng nhập + đổi mật khẩu
- [ ] Hướng dẫn setup 2FA TOTP cho TP/PTP/TBP
- [ ] Upload văn bản pháp luật (TP Vũ Văn Tuấn phân công)
- [ ] Test mobile Android 11+ thực tế
- [ ] PWA manifest (optional: add to home screen)
- [ ] SSL Labs: đạt A+
- [ ] securityheaders.com: đạt A

### 5.4 Monitoring & Ops (TODO)
- [ ] Setup cron risk-scan trên VPS (*/30 * * * *)
- [ ] Log rotate: journalctl + /var/log/loha-backup.log
- [ ] Monthly: test restore backup
- [ ] 12-month reminder: key rotation (`DATA_ENCRYPTION_KEY`)

---

## Backlog (sau go-live)

| Item | Mức độ ưu tiên |
|------|----------------|
| PWA push notifications | Trung bình |
| PDF export báo cáo tuần | Cao |
| Thi đua scoring | Thấp |
| MinIO file storage | Thấp |
| Multi-xã (nếu nhân rộng) | Rất thấp |
| HSTS preload list submission | Sau 2 tuần stable |
| CSP nonce-based (loại bỏ unsafe-inline) | Trung bình |
| Key rotation automation | Trung bình |
| docs/security-key-rotation.md | Trung bình |

---

## Phụ lục: Timeline thực tế

| Mốc | Ngày |
|-----|------|
| Khởi tạo project | 2026-05-09 |
| Phase 01-04 hoàn thành | 2026-05-11 |
| Security Overhaul P1-P4 hoàn thành | 2026-05-11 |
| Build clean (40 routes) | 2026-05-11 |
| VPS deploy (dự kiến) | Sau khi có VPS + domain |
