# Project Overview & Product Development Requirements (PDR)

**Dự án:** App Quản Lý Phòng Kinh Tế Xã Trần Phú, Hà Nội
**Phiên bản:** 1.4
**Cập nhật:** 2026-05-11
**Trạng thái:** Production — Phase AI-3 hoàn thành (AI Agent + Write Tools + Background Risk Scanner + TaskNote + RBAC Overhaul)

---

## Mục lục

1. [Tóm tắt dự án](#1-tóm-tắt-dự-án)
2. [Bối cảnh pháp lý](#2-bối-cảnh-pháp-lý)
3. [Stakeholders & Roles](#3-stakeholders--roles)
4. [Functional Requirements](#4-functional-requirements)
5. [Non-functional Requirements](#5-non-functional-requirements)
6. [Constraints](#6-constraints)
7. [Success Metrics](#7-success-metrics)
8. [Out of Scope](#8-out-of-scope)
9. [Changelog](#9-changelog)

---

## 1. Tóm tắt dự án

### Mục tiêu

Xây dựng hệ thống quản lý nội bộ cho **Phòng Kinh Tế Xã Trần Phú, TP Hà Nội** — phục vụ 21 cán bộ trong các nghiệp vụ hàng ngày: giao và theo dõi công việc, quản lý chỉ đạo từ UBND, xử lý phản ánh iHanoi, quản lý hồ sơ thủ tục hành chính (TTHC), lịch công tác, và tra cứu pháp luật bằng AI.

### Đặc điểm quan trọng

- **Mobile-first:** Cán bộ dùng điện thoại Android là chính
- **Tiếng Việt 100%:** Toàn bộ UI, thông báo, nhãn bằng tiếng Việt; technical terms tiếng Anh OK trong code
- **Người dùng không am hiểu kỹ thuật:** UX phải tối giản, rõ ràng
- **Tự host (data sovereignty):** Dữ liệu xã không rời khỏi server nội bộ UBND/VPS
- **PWA:** Cài được trên Android như app native (Add to Homescreen)
- **AI Legal Assistant nâng cao:** Hybrid RAG (vector + BM25 + Article Expansion + Conversation context) là tính năng differentiating chính

### Phạm vi

8 modules chức năng: Auth & RBAC, Quản lý công việc (với workflow xác nhận TP), Nhiệm vụ UBND, Phản ánh iHanoi, Hồ sơ TTHC, Lịch công tác & Báo cáo, Trợ lý AI Pháp lý (Agent + RAG + Risk Scanner), Lời nhắn (TaskNote).

---

## 2. Bối cảnh pháp lý

Hệ thống hỗ trợ thực hiện các quy định pháp luật liên quan đến quản lý hành chính xã:

| Văn bản | Nội dung liên quan |
|---------|-------------------|
| Luật Tổ chức chính quyền địa phương 2015 (sửa đổi 2019) | Phân cấp, phân quyền UBND xã; trách nhiệm cán bộ phòng chuyên môn |
| Nghị định 61/2018/NĐ-CP | Thực hiện cơ chế một cửa, một cửa liên thông trong giải quyết TTHC |
| Nghị định 107/2021/NĐ-CP | Sửa đổi Nghị định 61/2018 về cơ chế một cửa TTHC |
| Thông tư 01/2018/TT-VPCP | Hướng dẫn thực hiện Nghị định 61/2018 |
| Luật Đất đai 2024 | Thẩm quyền cấp GCNQSDĐ, chuyển mục đích SDĐ, GPMB |
| Luật Xây dựng 2014 (sửa đổi 2020) | Cấp phép xây dựng, kiểm tra trật tự xây dựng |
| Nghị định 16/2022/NĐ-CP | Xử phạt vi phạm hành chính về xây dựng |
| Luật Bảo vệ môi trường 2020 | Giấy phép môi trường, kiểm tra cơ sở SXKD |
| Quyết định phân công nhiệm vụ của UBND xã Trần Phú | Phân công 21 cán bộ, tổ chức thành 2 bộ phận và 2 tổ kiểm tra |

---

## 3. Stakeholders & Roles

### Cơ cấu tổ chức

```
BAN LÃNH ĐẠO
├── Vũ Văn Tuấn (Trưởng phòng - TRUONG_PHONG)
└── Trần Tuấn Minh (Phó Trưởng phòng - PHO_TP)

BỘ PHẬN TÀI CHÍNH - KẾ HOẠCH (4 người)
├── Vũ Huy Tư (Kế toán trưởng - Trưởng BP, TRUONG_BO_PHAN)
├── Nguyễn Thị Hoan (Chuyên viên - CHUYEN_VIEN)
├── Lương Thị Ngọc Phúc (Chuyên viên - CHUYEN_VIEN)
└── Nguyễn Thị Dung (Thủ quỹ - NHAN_VIEN)

BỘ PHẬN NN-MT & XD-CT (15 người)
├── Đinh Xuân Hội (Trưởng BP - TRUONG_BO_PHAN)
│
├── TỔ 1 - Kiểm tra đất đai, TTXD (HVT, Hữu Văn, Tân Tiến)
│   ├── Nguyễn Danh Hùng (Tổ trưởng - CHUYEN_VIEN)
│   ├── Đặng Quốc Chung (CHUYEN_VIEN)
│   └── Nguyễn Quốc Thủy (CHUYEN_VIEN)
│
├── TỔ 2 - Kiểm tra đất đai, TTXD (Mỹ Lương, Trần Phú, Đồng Tâm)
│   ├── Hoàng Văn Hợp (Tổ trưởng - CHUYEN_VIEN)
│   ├── Bùi Bá Chung (CHUYEN_VIEN)
│   └── Cao Văn Thịnh (CHUYEN_VIEN)
│
└── CHUYÊN VIÊN ĐỘC LẬP (9 người)
    Trịnh Duy Thuân, Trương Thị Tươi, Vương Công Chính,
    Vũ Thị Hải, Phạm Tuấn Phan, Trần Thị Diệp,
    Tạ Quang Hoành, Đặng Đức Tiễn, (+ nhân viên hành chính)
```

### Ma trận quyền hạn (RBAC) — v1.4

Permission matrix được viết lại hoàn toàn tại [`lib/permissions.ts`](../app/lib/permissions.ts). Quy tắc scope suffix: `:all` = toàn phòng, `:dept` = trong bộ phận, `:own` = chỉ liên quan trực tiếp user.

| Quyền | TRUONG_PHONG | PHO_TP | TRUONG_BO_PHAN | CHUYEN_VIEN | NHAN_VIEN |
|-------|:---:|:---:|:---:|:---:|:---:|
| Giao việc toàn phòng (`task:assign:all`) | ✓ | ✓ | - | - | - |
| Giao việc trong bộ phận (`task:assign:dept`) | ✓ | ✓ | ✓ | - | - |
| Tạo nhiệm vụ (`task:create`) | ✓ | ✓ | ✓ | - | - |
| Xem tất cả nhiệm vụ (`task:view:all`) | ✓ | ✓ | - | - | - |
| Xem nhiệm vụ bộ phận (`task:view:dept`) | ✓ | ✓ | ✓ | - | - |
| Xem nhiệm vụ của mình (`task:view:own`) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Xác nhận hoàn thành (`task:approve`) | ✓ | ✓ | - | - | - |
| Xóa nhiệm vụ (`task:delete`) | ✓ | - | - | - | - |
| Workflow assignee (start/report/submit) | ✓ | ✓ | ✓ | ✓ | - |
| Quản lý người dùng (`user:manage`) | ✓ | - | - | - | - |
| Xuất báo cáo CSV (`report:export`) | ✓ | ✓ | - | - | - |
| Tạo nhiệm vụ UBND (`ubnd:create`) | ✓ | - | - | - | - |
| Giao nhiệm vụ UBND (`ubnd:assign`) | ✓ | ✓ | - | - | - |
| Xem UBND toàn phòng (`ubnd:view:all`) | ✓ | ✓ | - | - | - |
| Xem UBND bộ phận (`ubnd:view:dept`) | ✓ | ✓ | ✓ | - | - |
| Xử lý iHanoi (`ihanoi:handle`) | ✓ | ✓ | ✓ | ✓ | - |
| Xử lý TTHC (`tthc:handle`) | ✓ | ✓ | ✓ | ✓ | - |
| Dùng AI đầy đủ (`ai:full`) | ✓ | ✓ | ✓ | ✓ | - |
| Dùng AI giới hạn (`ai:limited`) | - | - | - | - | ✓ |
| Upload văn bản pháp lý | ✓ | ✓ | - | - | - |
| Quản lý văn bản pháp lý | ✓ | - | - | - | - |
| Tạo/gửi lời nhắn TaskNote | ✓ | ✓ | ✓ (trong dept) | - | - |
| Quản lý lịch toàn phòng | ✓ | ✓ | - | - | - |
| Quản lý lịch bộ phận | ✓ | ✓ | ✓ | - | - |
| Quản lý lịch cá nhân | ✓ | ✓ | ✓ | ✓ | ✓ |

**Ghi chú quan trọng:**
- `CHUYEN_VIEN` có `ai:full` (dùng AI đầy đủ) nhưng AI agent scope-restricted — chỉ hỏi về việc của mình; tool `createTask` / `getUserWorkload` bị chặn bởi `requiresRole`
- `NHAN_VIEN` có `ai:limited` — AI scope-restricted nghiêm ngặt; không thấy iHanoi/TTHC
- `TRUONG_BO_PHAN` có thể quản nhiều bộ phận qua `User.managedDepartments[]` (vd: Đinh Xuân Hội phụ trách cả NN-MT + XD-CT)
- **Deprecated:** `isLeader()` — không dùng trong code mới; dùng `isTopLeader()` / `isDeptManager()` thay thế

---

## 4. Functional Requirements

### Module 1: Xác thực & Phân quyền (Auth & RBAC)

**FR-AUTH-01:** Đăng nhập bằng email + mật khẩu (scrypt hash, session cookie HttpOnly 7 ngày)
**FR-AUTH-02:** Middleware bảo vệ tất cả route dashboard — redirect về `/login` nếu chưa xác thực
**FR-AUTH-03:** Tài khoản bị vô hiệu hóa (`isActive=false`) bị redirect về `/login?error=inactive`
**FR-AUTH-04:** Đổi mật khẩu tại trang `/profile`
**FR-AUTH-05:** 5 cấp quyền: `TRUONG_PHONG → PHO_TP → TRUONG_BO_PHAN → CHUYEN_VIEN → NHAN_VIEN`
**FR-AUTH-06:** Seed 21 tài khoản từ Quyết định phân công, mật khẩu mặc định `ChangeMe@2026`

### Module 2: Quản lý & Giao việc (/tasks)

**FR-TASK-01:** Tạo nhiệm vụ: tiêu đề, mô tả, độ ưu tiên (KHAN_CAP/CAO/THUONG/THAP), deadline, assignee (cá nhân hoặc nhóm Tổ 1/Tổ 2)
**FR-TASK-02:** Giao việc top-down: chỉ TRUONG_BO_PHAN trở lên mới tạo/giao việc; CHUYEN_VIEN/NHAN_VIEN không tạo/sửa metadata task
**FR-TASK-03:** Sub-tasks (`parentTaskId`)
**FR-TASK-04:** Nguồn: `INTERNAL` / `UBND_DIRECTIVE` / `IHANOI`
**FR-TASK-05:** Cập nhật tiến độ: % hoàn thành + ghi chú + vướng mắc

**FR-TASK-06: Workflow 4 trạng thái có xác nhận TP (mới):**
```
PENDING ─Bắt đầu(assignee)→ IN_PROGRESS
        ─Gửi hoàn thành(assignee)→ AWAITING_REVIEW
        ─TP/PTP xác nhận→ COMPLETED
        ─TP/PTP yêu cầu làm lại→ IN_PROGRESS
```
- Assignee: start, addProgressReport, submit (chuyển sang AWAITING_REVIEW)
- TP/PTP: confirm (`task:approve`), reject (về IN_PROGRESS), cancel
- CHUYEN_VIEN/NHAN_VIEN: KHÔNG được confirm/reject
- Fields mới trên Task: `submittedAt`, `confirmedById`, `confirmedAt`
- Enum `TaskStatus` bao gồm: PENDING / IN_PROGRESS / AWAITING_REVIEW / COMPLETED / OVERDUE / CANCELLED

**FR-TASK-07:** Tab counts: Tất cả / Cần thực hiện / Đang xử lý / Chờ duyệt / Quá hạn / Hoàn thành
**FR-TASK-08:** Lọc theo thời gian (DateRangeFilter), tìm kiếm theo tên
**FR-TASK-09:** Soft delete (`deletedAt`)
**FR-TASK-10:** Thông báo khi được giao việc (`TASK_ASSIGNED`)
**FR-TASK-11:** Thông báo quá hạn (`TASK_OVERDUE`), cảnh báo rủi ro từ background scanner

**FR-TASKNOTE-01: Lời nhắn lãnh đạo (TaskNote - mới):**
- TP/PTP gửi lời nhắn cho bất kỳ task; TBP gửi trong bộ phận
- Assignee xem được note dành cho mình
- Comment-thread style: nhiều note per task, sort ghim trước + mới nhất
- `isPinned`: chỉ TP có thể ghim
- Notification type `TASK_NOTE` gửi cho assignee
- Snapshot immutable: `authorName`, `authorPosition`, `authorRole` lưu lúc tạo
- AI tool `addTaskNote` cho phép leader nhắn qua chat AI

### Module 3: Nhiệm vụ UBND (/ubnd)

**FR-UBND-01:** Nhập nhiệm vụ từ văn bản UBND xã (số văn bản, tiêu đề, ngày ban hành, deadline)
**FR-UBND-02:** Giao cho cán bộ phụ trách, theo dõi trạng thái
**FR-UBND-03:** Ghi nhận phản hồi từ phòng (`phongResponse`)
**FR-UBND-04:** Lọc theo trạng thái, thời gian; xuất CSV/in

### Module 4: Phản ánh iHanoi (/ihanoi)

**FR-IHANOI-01:** Nhập phản ánh từ cổng iHanoi (mã ticket, nội dung, thông tin công dân)
**FR-IHANOI-02:** Giao xử lý cho cán bộ phù hợp
**FR-IHANOI-03:** Ghi nhận kết quả xử lý, ngày giải quyết
**FR-IHANOI-04:** Theo dõi deadline, cảnh báo quá hạn

### Module 5: Hồ sơ TTHC (/tthc)

**FR-TTHC-01:** Tiếp nhận hồ sơ thủ tục hành chính (mã TTHC, tên thủ tục, thông tin người nộp)
**FR-TTHC-02:** Cập nhật trạng thái: RECEIVED → PROCESSING → COMPLETED / RETURNED
**FR-TTHC-03:** Theo dõi deadline theo quy định
**FR-TTHC-04:** Phân công người xử lý, ghi chú theo địa bàn (Tổ 1/Tổ 2)

### Module 6: Lịch công tác & Báo cáo (/schedule, /reports)

**FR-SCHED-01:** Cán bộ nhập lịch công tác cá nhân (tuần/tháng, có thể toàn ngày)
**FR-SCHED-02:** Trưởng phòng/Phó TP quản lý lịch toàn phòng
**FR-SCHED-03:** Báo cáo công việc tuần/tháng
**FR-SCHED-04:** Xuất báo cáo CSV và in từ browser
**FR-SCHED-05:** Dashboard summary: 4 ô thống kê

### Module 7: Trợ lý AI — Agent + Pháp lý (/ai, /legal)

**FR-AI-01:** Chatbot hỏi đáp pháp luật tiếng Việt — streaming response (SSE)

**FR-AI-AGENT: AI Agent với Tool Calling (mới):**

**FR-AI-AGENT-01 (Phase AI-1 — Read Tools):** AI có 6 read tool:
- `getTaskStats` — thống kê số liệu task theo vai trò người hỏi
- `getOverdueTasks` — danh sách task quá hạn (scope-aware)
- `getMyTasks` — task được giao cho user hiện tại
- `getUserWorkload` — workload của một cán bộ cụ thể (chỉ TP/PTP/TBP)
- `getUBNDDirectives` — truy vấn chỉ đạo UBND
- `searchLegalDocs` — tìm kiếm văn bản pháp lý (chỉ legal viewer)
- Hybrid: tự fallback về RAG nếu agent fail
- Files: [`lib/ai-tools/agent.ts`](../app/lib/ai-tools/agent.ts), [`lib/ai-tools/registry.ts`](../app/lib/ai-tools/registry.ts), [`lib/ai-tools/types.ts`](../app/lib/ai-tools/types.ts), `lib/ai-tools/tools/*.ts`

**FR-AI-AGENT-02 (Phase AI-2 — Write Tools + Confirmation UI):** 5 write tool:
- `createTask` — tạo nhiệm vụ mới
- `updateTaskStatus` — cập nhật trạng thái (dùng action enum: start/submit/confirm/reject/cancel)
- `addProgressReport` — thêm báo cáo tiến độ
- `createReminder` — tạo nhắc nhở lịch công tác
- `addTaskNote` — gửi lời nhắn cho assignee (xem FR-TASKNOTE)
- **Stateless confirmation pattern:** tool `execute()` chạy dry-run → trả `DryRunResult` với `__pendingAction` → UI render `<ConfirmationCard>` → user click "Xác nhận" → POST `/api/ai/confirm-action` → executeTool với `ctx.confirmed=true`
- Files: [`lib/ai-tools/tools/write-tools.ts`](../app/lib/ai-tools/tools/write-tools.ts), [`components/ai/confirmation-card.tsx`](../app/components/ai/confirmation-card.tsx), [`app/api/ai/confirm-action/route.ts`](../app/app/api/ai/confirm-action/route.ts)

**FR-AI-AGENT-03 (Phase AI-3 — Background Risk Scanner):** Cron-driven 30 phút, 7 loại rủi ro:
- `RISK_OVERDUE` — task quá hạn chưa hoàn thành
- `RISK_DEADLINE_SOON` — deadline trong vòng 24h
- `RISK_STALE_PENDING` — task PENDING quá 3 ngày không bắt đầu
- `RISK_UBND_DEADLINE` — chỉ đạo UBND sắp hết hạn
- `RISK_OVERLOAD` — cán bộ có quá nhiều task active
- `RISK_NO_REPORT` — task IN_PROGRESS > 3 ngày không có báo cáo
- `RISK_AWAITING_REVIEW` — task chờ TP xác nhận quá 1 ngày
- Dedup 24h per (userId, type, entityId) — không spam
- Auto-mark OVERDUE trước khi scan
- Notification gửi tới assignee + leader phù hợp
- Files: [`lib/ai-monitor/scanner.ts`](../app/lib/ai-monitor/scanner.ts), [`app/api/cron/risk-scan/route.ts`](../app/app/api/cron/risk-scan/route.ts)
- Setup: xem [`app/docs/ai-monitor-cron.md`](../app/docs/ai-monitor-cron.md)

**FR-AI-02:** **Hybrid RAG pipeline 3 tầng fallback:**
- Tầng 1 (ưu tiên): Article Expansion — `retrieveWithArticleExpansion()`: hybrid vector+BM25 → group theo Điều → pull TOÀN BỘ Khoản của top-3 Điều
- Tầng 2 (fallback): `retrieveHybrid()` — vector top-30 + BM25 re-rank + combine (0.6 cosine + 0.4 BM25)
- Tầng 3 (last resort): `retrieveRelevantChunks()` — legacy BM25 keyword

**FR-AI-03:** **Multi-turn conversation context:**
- Load 5 Q-A gần nhất làm context cho LLM (multi-turn messages array)
- Detect follow-up question bằng regex Vietnamese-aware + câu ≤ 4 từ
- Nếu follow-up: REUSE chunks từ sources tin nhắn trước (không retrieve lại) — giảm latency + tiết kiệm tokens
- Conversation được lưu per user, tự động tạo title từ câu hỏi đầu (80 chars)
- `isPinned`: ghim conversation quan trọng

**FR-AI-04:** **Vector embedding:**
- `gemini-embedding-001`, 768 dim, Matryoshka (re-normalize sau truncate)
- Task types: `RETRIEVAL_DOCUMENT` (indexing) vs `RETRIEVAL_QUERY` (searching)
- Auto-embed sau upload: `uploadLegalDocument()` tự sinh embedding cho tất cả chunks (best-effort)

**FR-AI-05:** Trích dẫn inline: `[150/2025/NĐ-CP, Điều 4, Khoản 1]` — không hiển thị block "Trích dẫn" riêng trong UI

**FR-AI-06:** Upload văn bản pháp lý (PDF + Gemini Vision OCR hoặc plain text) → chunking theo Điều/Khoản → lưu `LegalChunk` + auto-embed

**FR-AI-07:** **Parallel PDF OCR** (pdf-lib + Gemini Vision):
- Worker pool 4 batch song song, 15 trang/batch
- PDF 200+ trang: ~5 phút → ~1-1.5 phút
- Auto-rotate Gemini API key per batch call

**FR-AI-08:** Quản lý kho văn bản: liệt kê, đánh dấu "đã thay thế" (superseded), xóa

**FR-AI-09:** Lưu lịch sử hội thoại per user (`ChatHistory`), đánh giá 1-5 sao, bookmark

**FR-AI-10:** Thông tin provider AI ẩn hoàn toàn — user chỉ thấy câu trả lời và nguồn trích dẫn; `maxTokens = 6000` để AI trả lời đủ dài

---

## 5. Non-functional Requirements

### Bảo mật

- **NFR-SEC-01:** HTTPS bắt buộc, HSTS header, Let's Encrypt
- **NFR-SEC-02:** HttpOnly session cookie (prefix `pkt`), không expose qua JavaScript
- **NFR-SEC-03:** RBAC 3 tầng: middleware → page-level → server action. Scope filter dùng `isTopLeader()`/`isDeptManager()`/`getManagedDepartments()` — không dùng `isLeader()` cũ
- **NFR-SEC-04:** Không lộ tên AI provider/model qua API hoặc UI; error sanitization loại bỏ vendor details
- **NFR-SEC-05:** AI API keys chỉ trong env vars server-side
- **NFR-SEC-06:** PostgreSQL không expose port ra ngoài (internal Docker network)
- **NFR-SEC-07:** Input validation Zod trước mọi database operation
- **NFR-SEC-08:** Soft delete — không xóa dữ liệu thật khỏi DB

### Hiệu năng

- **NFR-PERF-01:** LCP < 2.5 giây trên kết nối 4G
- **NFR-PERF-02:** AI first token < 2 giây, trả lời hoàn thành < 15 giây (với maxTokens=6000)
- **NFR-PERF-03:** INP < 200ms cho các tương tác form
- **NFR-PERF-04:** Xuất báo cáo CSV trong < 3 giây
- **NFR-PERF-05:** PDF OCR: ≤ 15 trang trong < 30 giây; 200 trang trong < 2 phút (4 batch song song)
- **NFR-PERF-06:** Vector search (pgvector cosine) < 200ms trên corpus < 50K chunks

### Khả dụng

- **NFR-AVAIL-01:** Uptime ≥ 99% trên VPS sau deploy
- **NFR-AVAIL-02:** Docker healthcheck endpoint `/api/health`
- **NFR-AVAIL-03:** Hosting kép: VPS cloud (primary) + server vật lý UBND (backup)
- **NFR-AVAIL-04:** Backup PostgreSQL hàng ngày lúc 2:00 AM, retention 30 ngày
- **NFR-AVAIL-05:** AI graceful degradation: nếu tất cả embedding key fail → fallback BM25 tự động

### Accessibility & Mobile

- **NFR-MOB-01:** Touch targets tối thiểu `min-h-[44px]`
- **NFR-MOB-02:** PWA cài được trên Android Chrome 11+ và iOS Safari
- **NFR-MOB-03:** Offline mode: xem danh sách task khi mất mạng (Service Worker cache)
- **NFR-MOB-04:** Font Noto Sans với Vietnamese subset
- **NFR-MOB-05:** Responsive: BottomNav mobile, Sidebar desktop (breakpoint `md:`)

### Ngôn ngữ & Địa phương hóa

- **NFR-I18N-01:** 100% tiếng Việt cho tất cả label, thông báo, placeholder
- **NFR-I18N-02:** Format ngày `dd/MM/yyyy`, tuần bắt đầu thứ Hai
- **NFR-I18N-03:** Locale `vi` của date-fns
- **NFR-I18N-04:** Từ vựng hành chính chuẩn (TTHC, GCNQSDĐ, GPMB, iHanoi)

---

## 6. Constraints

### Chủ quyền dữ liệu (Data Sovereignty)

Dữ liệu của xã Trần Phú không được lưu trên cloud bên thứ ba. Tất cả phải tự host. File uploads lưu local filesystem; embedding API gọi ra ngoài (Gemini) là chấp nhận được vì chỉ gửi text chunks, không gửi dữ liệu cán bộ.

### Bảo mật thông tin AI

AI provider info (tên model, API key, tên vendor) hoàn toàn ẩn khỏi người dùng. Server tự chọn provider — client không có quyền chỉ định.

### Giới hạn nhân lực kỹ thuật

Không có bộ phận IT tại phòng — deploy qua `docker compose up -d --build` đơn giản. Migration chạy qua scripts.

### Ngân sách vận hành

VPS $12-20/tháng. Ưu tiên Gemini (free tier) → DeepSeek (rẻ) → Anthropic (dự phòng chất lượng cao).

### Phụ thuộc hạ tầng

- PostgreSQL 16 + pgvector (`pgvector/pgvector:pg16`)
- Docker Compose cho toàn bộ stack
- Nginx làm reverse proxy + SSL
- Gemini API cho embedding (bắt buộc để dùng hybrid RAG; hệ thống vẫn hoạt động với BM25 nếu không có key)

---

## 7. Success Metrics

| Metric | Mục tiêu | Đo lường |
|--------|---------|---------|
| Đăng nhập đúng quyền | 21/21 users | Smoke test sau seed |
| Giao việc → nhận thông báo | < 5 giây | Server action → notification |
| Xuất CSV báo cáo | < 3 giây | Chrome DevTools |
| AI first token | < 2 giây | Streaming delay |
| AI full response | < 15 giây (6000 tokens) | End-to-end |
| RAG chất lượng | Đúng Điều/Khoản trên 80% query thực tế | Đánh giá thủ công |
| PDF OCR 200 trang | < 2 phút | `durationMs` field |
| LCP mobile | < 2.5 giây trên 4G | Lighthouse |
| Uptime VPS | ≥ 99% | Healthcheck monitor |
| PWA install | Cài được Android Chrome | Manual test |
| SSL rating | A+ | ssllabs.com |
| Backup | .sql hàng ngày | Verify `/backups/` |

---

## 8. Out of Scope (v1.1)

| Tính năng | Lý do hoãn | Ghi chú |
|-----------|-----------|---------|
| Đồng bộ tự động với cổng iHanoi | Cần API key + protocol từ UBND TP | Hiện nhập tay; schema đã sẵn sàng |
| Real-time notifications (WebSocket) | Server-sent events đủ cho hiện tại | Xem xét Phase 07 |
| Mở rộng multi-xã | Scope phase 1 chỉ cho Trần Phú | Architecture cho phép |
| Chữ ký số điện tử (e-signature) | Phụ thuộc PKI hạ tầng cấp tỉnh | Dự án riêng |
| MinIO object storage | Local filesystem đủ cho giai đoạn đầu | Nâng cấp khi cần scale |
| Mobile native app (iOS/Android) | PWA đủ cho nhu cầu | Xem xét khi user base lớn |
| Tích hợp VBDXP (VNeID) | Chưa có yêu cầu chính thức | - |
| Audit log chi tiết | Cân nhắc GDPR/luật bảo vệ dữ liệu VN | Phase 08 |
| 2FA / OTP | Sau khi users quen hệ thống | Phase 08 |
| Re-ranking bằng Cross-encoder | Cải thiện RAG quality hơn nữa | Cần research |
| Streaming embeddings (batch lớn) | Corpus hiện tại < 50K chunks — đủ | Khi cần scale |

---

## 9. Changelog

| Phiên bản | Ngày | Thay đổi |
|-----------|------|---------|
| 1.4 | 2026-05-11 | Thêm AI Agent (Phase AI-1/2/3), TaskNote, RBAC overhaul (matrix mới), task workflow AWAITING_REVIEW |
| 1.3 | 2026-05-10 | Phase 06 Hybrid RAG + Parallel PDF OCR hoàn thành |
| 1.2 | 2026-05-10 | Multi-turn conversation context, Article Expansion RAG |
| 1.1 | 2026-05-10 | BM25 standard scoring, embeddings infrastructure |
| 1.0 | 2026-05 | Phiên bản khởi đầu (Foundation → AI Legal BM25) |
