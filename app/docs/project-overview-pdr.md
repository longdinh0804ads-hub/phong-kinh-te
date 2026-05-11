# Project Overview & PDR — App PKT Xã Trần Phú

**Phiên bản:** 2.0 (sau Security Overhaul P1-P4)
**Cập nhật:** 2026-05-11
**Trạng thái:** Demo local — chuẩn bị deploy VPS

---

## 1. Tổng quan dự án

Ứng dụng quản lý nội bộ cho **Phòng Kinh Tế Xã Trần Phú, TP Hà Nội**. Phục vụ 21 cán bộ với 5 cấp quyền, 7 module nghiệp vụ, AI pháp lý, và stack bảo mật cấp sản xuất.

### Mục tiêu
- Tối ưu hóa quy trình giao việc, theo dõi tiến độ, nghiệm thu kết quả theo đúng phân cấp
- Số hóa nghiệp vụ hành chính: chỉ đạo UBND, phản ánh iHanoi, hồ sơ TTHC
- Hỗ trợ cán bộ tra cứu pháp lý nhanh qua AI (nghị định, thông tư, quyết định)
- Bảo vệ dữ liệu công dân và hoạt động nội bộ theo tiêu chuẩn bảo mật cao

### Phạm vi
- Chỉ phục vụ xã Trần Phú (không multi-xã)
- Thiết bị: mobile-first Android, hỗ trợ desktop

---

## 2. Cơ sở pháp lý

| Văn bản | Nội dung |
|---------|---------|
| QĐ 480/2025/QĐ-UBND | Chức năng, nhiệm vụ Phòng Kinh Tế |
| NĐ 78/2025/NĐ-CP | Quản lý nhà nước về kinh tế |
| NĐ 187/2025/NĐ-CP | Tổ chức bộ máy cấp xã |
| NĐ 79/2025/NĐ-CP | Điều kiện kinh doanh |
| NĐ 150/2025/NĐ-CP | Quản lý tài chính công |
| TT 10/2025/TT-BXD | Xây dựng |
| TT 37/2025/TT-BCT | Công thương |
| TT 19/2025/TT-BNNMT | Nông nghiệp, môi trường |
| TT 57/2025/TT-BTC | Tài chính |

---

## 3. Tech Stack

| Layer | Công nghệ | Ghi chú |
|-------|-----------|---------|
| Framework | Next.js 16 App Router | TypeScript strict mode |
| Database | PostgreSQL 16 + pgvector | Trên LUKS encrypted volume |
| ORM | Prisma 6 + Client Extension | Extension transparent encrypt |
| Auth | Better Auth | Session cookie, RBAC 5 cấp |
| Password | `@node-rs/argon2` (Argon2id) | + pepper HMAC-SHA256, bcrypt migration |
| 2FA | `otpauth` TOTP | Bắt buộc TP/PTP/TBP/SUPER_ADMIN |
| Encryption | AES-256-GCM + HKDF | Envelope per-field, key rotation ready |
| Blind Index | HMAC-SHA256 + trigram | Search trên encrypted fields |
| Captcha | Cloudflare Turnstile | Sau 2 lần fail login |
| Email | Resend | Alert: new device, lockout, 2FA, pw change |
| AI Chat | Gemini 2.5 Flash / DeepSeek / Claude | Fallback chain |
| AI Embed | Gemini `gemini-embedding-001` 768 dim | Hybrid RAG |
| UI | shadcn/ui + Tailwind CSS v4 + Noto Sans | Mobile-first |
| Deploy | VPS Ubuntu 22.04 + Nginx TLS 1.3 | Systemd hardened service |
| Backup | pg_dump → GPG → rsync Windows local | Cron 02:00 hàng ngày |

---

## 4. Kiến trúc RBAC

### 5 Cấp quyền

| Role | Cấp | Phạm vi | 2FA |
|------|-----|---------|-----|
| `SUPER_ADMIN` | 0 | Quản trị hệ thống | Bắt buộc |
| `TRUONG_PHONG` | 1 | Toàn phòng | Bắt buộc |
| `PHO_TP` | 2 | Toàn phòng | Bắt buộc |
| `TRUONG_BO_PHAN` | 3 | Bộ phận (có thể đa bộ phận) | Bắt buộc |
| `CHUYEN_VIEN` | 4 | Task được giao | Không bắt buộc |
| `NHAN_VIEN` | 5 | Task của mình | Không bắt buộc |

### 4 Bộ phận (Department)
- `BAN_LANH_DAO`
- `TAI_CHINH_KE_HOACH`
- `NONG_NGHIEP_MOI_TRUONG`
- `XAY_DUNG_CONG_THUONG`

---

## 5. Modules & Functional Requirements

### 5.1 Auth & Security (P1-P4 DONE)

**FR-AUTH-01:** Đăng nhập email/password với Argon2id + pepper.
- Độ phức tạp: min 12 ký tự, 3/4 nhóm (upper/lower/digit/special)
- Không dùng common password, không chứa email/tên
- Không repeat 5 password gần nhất

**FR-AUTH-02:** Lockout DB-backed (không in-memory).
- 5 lần fail / 15 phút → lock 15 phút
- 10 lần fail / 1 giờ → lock đến admin mở
- 20 lần fail / 1 giờ / IP → block IP 24 giờ

**FR-AUTH-03:** Session binding.
- Absolute 8 giờ, idle 30 phút
- Binding IP /24 subnet + UA hash (browser + OS) + deviceId
- Mismatch score ≥ 2 → revoke + log SecurityEvent

**FR-AUTH-04:** 2FA TOTP bắt buộc cho TP/PTP/TBP/SUPER_ADMIN.
- Trang `/login/2fa` sau khi pass password
- 8 backup codes dùng 1 lần
- User xác nhận thiết bị tin cậy qua UI

**FR-AUTH-05:** Anomaly detection.
- New device → email alert + log NEW_DEVICE
- Impossible travel (2 thành phố < 1 giờ) → log IMPOSSIBLE_TRAVEL critical
- Off-hours (22h–6h, lần đầu) → log info

**FR-AUTH-06:** Force change password.
- Admin reset → `mustChangePassword = true` → redirect `/change-password`
- Password expiry: 180 ngày cho TP/PTP/SUPER_ADMIN

### 5.2 Task Management

**FR-TASK-01:** Giao việc top-down theo RBAC.
- TP/PTP: tạo cho bất kỳ ai
- TBP: tạo trong bộ phận quản lý
- CV/NV: không tạo task

**FR-TASK-02:** Workflow 4 bước có xác nhận.
```
PENDING → IN_PROGRESS → AWAITING_REVIEW → COMPLETED
                             └→ (reject) → IN_PROGRESS
* → CANCELLED
```
- Assignee: start, cập nhật progress, submit khi xong
- TP/PTP: confirm hoặc reject — không được sửa progress của cán bộ

**FR-TASK-03:** Sub-tasks, TaskNote (lời nhắn lãnh đạo), nguồn nhiệm vụ.

**FR-TASK-04:** Risk scanner (cron 30 phút): overdue, deadline soon, stale pending, UBND deadline, overload, no report.

### 5.3 Nghiệp vụ hành chính

**FR-ADM-01:** Chỉ đạo UBND — nhập, phân công, theo dõi, phản hồi.
**FR-ADM-02:** Phản ánh iHanoi — nhập thủ công, giao xử lý, lưu kết quả.
**FR-ADM-03:** Hồ sơ TTHC — tiếp nhận → xử lý → hoàn thành / trả lại.
**FR-ADM-04:** Lịch công tác tuần/tháng + báo cáo tổng hợp + xuất CSV.

### 5.4 AI Pháp lý

**FR-AI-01:** Hybrid RAG — Article Expansion → Vector + BM25 → BM25 fallback.
**FR-AI-02:** AI Agent với 6 read tools + 5 write tools (stateless dry-run + confirm pattern).
**FR-AI-03:** Multi-provider với fallback chain.

### 5.5 Field-level Encryption (P3 DONE)

**FR-ENC-01:** Tất cả PII và nội dung nhạy cảm trong DB phải ở dạng mã hóa.
- `iHanoiComplaint`: content, citizenName, citizenPhone, citizenAddress, resolution
- `tTHCRecord`: applicantName, applicantPhone, notes
- `taskNote.content`, `task.description`, `progressReport.notes/blockers`
- `user.phone`, `user.responsibilities`
- `notification.message`, `account.accessToken/refreshToken/idToken`

**FR-ENC-02:** Blind index cho phép search trên dữ liệu đã encrypt.
- Exact (HMAC-SHA256): phone lookup
- Trigram (3-gram): tên người dân fuzzy search

---

## 6. Non-Functional Requirements

### 6.1 Security
- **NFR-SEC-01:** Mật khẩu không bao giờ lưu plaintext. Argon2id (m=19MiB, t=2, p=1) + pepper.
- **NFR-SEC-02:** Dữ liệu nhạy cảm không bao giờ lưu plaintext trong DB. AES-256-GCM envelope.
- **NFR-SEC-03:** TLS 1.3 only, HSTS 2 năm, OCSP stapling trên production.
- **NFR-SEC-04:** CSP, X-Frame-Options DENY, X-Content-Type-Options trên mọi response.
- **NFR-SEC-05:** Backup encrypted (GPG RSA-4096) trước khi rời khỏi VPS.
- **NFR-SEC-06:** Nginx rate limit: 10 req/min cho auth, 60 req/min cho API.
- **NFR-SEC-07:** AI provider, API keys, model names không được tiết lộ cho end user.

### 6.2 Performance
- **NFR-PERF-01:** Login flow (với 2FA) ≤ 2 giây.
- **NFR-PERF-02:** Dashboard load ≤ 1.5 giây (cached data).
- **NFR-PERF-03:** AI response đầu tiên ≤ 3 giây (streaming).
- **NFR-PERF-04:** PDF report export ≤ 3 giây.

### 6.3 Availability
- **NFR-AVL-01:** Uptime ≥ 99% sau go-live.
- **NFR-AVL-02:** Systemd auto-restart khi crash.
- **NFR-AVL-03:** Backup hàng ngày, restore test hàng tháng.

### 6.4 Usability
- **NFR-UX-01:** Mobile-first Android 11+, màn hình 5".
- **NFR-UX-02:** Font Noto Sans 18px (dễ đọc cho cán bộ lớn tuổi).
- **NFR-UX-03:** Thông báo realtime (Bell popup) khi có task mới hoặc rủi ro.

---

## 7. Acceptance Criteria

- [ ] 21 users đăng nhập được, đúng quyền theo role
- [ ] TP/PTP/TBP bị bắt setup 2FA TOTP khi vào lần đầu
- [ ] Password cũ (ChangeMe@2026) bị reject bởi policy sau khi đổi
- [ ] Dữ liệu phone/tên trong DB hiển thị `enc:AQ...` (không plaintext)
- [ ] Search tên công dân qua blind index trả về kết quả đúng
- [ ] Trưởng phòng giao việc → CV nhận thông báo < 5 giây
- [ ] Task AWAITING_REVIEW → TP confirm/reject, không tự đóng được
- [ ] Backup script tạo file `.sql.gpg`, không decrypt được nếu thiếu private key
- [ ] SSL Labs: A+ | securityheaders.com: A
- [ ] Login từ device mới → nhận email cảnh báo trong < 30 giây

---

## 8. Constraints & Decisions

| Quyết định | Lý do |
|-----------|-------|
| Self-host VPS (không Vercel) | Data sovereignty, kiểm soát infra, chi phí |
| PostgreSQL trên LUKS volume | Chống stolen disk |
| Resend (không Gmail SMTP) | Deliverability, không cần Google Workspace |
| Cloudflare Turnstile (không reCAPTCHA) | Privacy-friendly, không tracking |
| Argon2id (không bcrypt) | Memory-hard, chống GPU crack |
| Per-field encryption (không full-disk only) | Defense-in-depth: DB dump cũng không đọc được |
| Prisma extension transparent | Không cần sửa từng action, encrypt/decrypt tự động |
| Blind index riêng (không tìm kiếm full scan) | Performance O(1) lookup thay vì decrypt-all-then-filter |
