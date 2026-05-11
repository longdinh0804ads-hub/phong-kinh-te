# Project Roadmap

**Dự án:** App Quản Lý Phòng Kinh Tế Xã Trần Phú
**Cập nhật:** 2026-05-11

---

## Mục lục

1. [Tổng quan trạng thái](#1-tổng-quan-trạng-thái)
2. [Phases đã hoàn thành](#2-phases-đã-hoàn-thành)
3. [Backlog — Phase 07+](#3-backlog--phase-07)
4. [Technical Debt & Improvements](#4-technical-debt--improvements)
5. [Quyết định kiến trúc đã thực hiện](#5-quyết-định-kiến-trúc-đã-thực-hiện)

---

## 1. Tổng quan trạng thái

| Phase | Tên | Trạng thái | Ngày hoàn thành |
|-------|-----|-----------|----------------|
| 01 | Foundation | Hoàn thành | 2026-05 |
| 02 | Task Management | Hoàn thành | 2026-05 |
| 03 | UBND / iHanoi / TTHC / Lịch / Báo cáo | Hoàn thành | 2026-05 |
| 04 | AI Legal Assistant (BM25) + Multi-provider | Hoàn thành | 2026-05 |
| 05 | PWA + Docker Compose + Nginx + Deploy | Hoàn thành | 2026-05 |
| 06 | **Hybrid RAG + Parallel PDF OCR** | **Hoàn thành** | **2026-05** |
| AI-1 | **AI Agent Read Tools** | **Hoàn thành** | **2026-05** |
| AI-2 | **AI Agent Write Tools + Confirmation UI** | **Hoàn thành** | **2026-05** |
| AI-3 | **Background Risk Scanner** | **Hoàn thành** | **2026-05** |
| RBAC | **RBAC Overhaul (permission matrix mới)** | **Hoàn thành** | **2026-05** |
| WF | **Task Workflow + TP Confirmation** | **Hoàn thành** | **2026-05** |
| TN | **TaskNote (Lời nhắn lãnh đạo)** | **Hoàn thành** | **2026-05-11** |
| AI-4 | Daily Morning Briefing 7AM | Kế hoạch | - |
| AI-5 | Auto-summary weekly report | Kế hoạch | - |
| AI-6 | Predictive risk (ML-based) | Kế hoạch | - |
| 07 | iHanoi API + Real-time notifications | Chờ / Gác lại | - |
| 08 | Audit log + 2FA + VBDXP | Kế hoạch | - |

---

## 2. Phases đã hoàn thành

### Phase 01 — Foundation

- Schema 15 Prisma models + 6 enums
- Better Auth + scrypt password hash
- RBAC 5 cấp: `TRUONG_PHONG`, `PHO_TP`, `TRUONG_BO_PHAN`, `CHUYEN_VIEN`, `NHAN_VIEN`
- Seed 21 users theo Quyết định phân công của UBND xã Trần Phú
- Next.js App Router shell + shadcn/ui + Tailwind CSS v4
- Mobile-first layout: Sidebar (desktop) + BottomNav (mobile)
- Font Noto Sans Vietnamese

### Phase 02 — Task Management

- CRUD nhiệm vụ với giao top-down theo cấp quyền
- Giao cho cá nhân hoặc nhóm (Tổ 1/Tổ 2)
- Sub-tasks (`parentTaskId`)
- Cập nhật tiến độ % + ghi chú + vướng mắc
- Tab counts: Tất cả / Cần thực hiện / Đang xử lý / Quá hạn / Hoàn thành
- DateRangeFilter reusable: Hôm nay / Hôm qua / Tuần này / Tháng này / Tùy chỉnh
- Notification khi được giao việc
- Soft delete

### Phase 03 — Operational Modules

- **UBND Directives:** Nhập, giao, phản hồi chỉ đạo từ UBND xã
- **iHanoi Complaints:** Nhập thủ công phản ánh, giao xử lý, ghi kết quả (API tự động gác lại)
- **TTHC Records:** Tiếp nhận → Xử lý → Hoàn thành/Trả lại
- **Work Schedule:** Lịch công tác tuần/tháng
- **Reports:** Báo cáo tổng hợp + xuất CSV + in từ browser
- Dashboard home: 4 ô thống kê + trách nhiệm phụ trách

### Phase 04 — AI Legal Assistant (BM25 baseline)

- Upload văn bản pháp lý (PDF text + DOCX) → chunking theo Điều/Khoản
- RAG keyword BM25 (TF + title boost + coverage bonus) — `lib/rag.ts`
- Multi-provider AI: Gemini 2.5 Flash, DeepSeek Chat, Claude Sonnet 4.5
- Auto-select provider theo availability: Gemini → DeepSeek → Anthropic
- `APIKeyRotator`: round-robin + cooldown (429/401/5xx)
- Lịch sử chat, đánh giá 1-5 sao, bookmark
- Thông tin provider ẩn hoàn toàn với user

### Phase 05 — Production Infrastructure

- Dockerfile + docker-compose.yml + docker-compose.prod.yml
- Nginx reverse proxy + SSL placeholder
- PostgreSQL backup cron (pg_dump hàng ngày, retention 30 ngày)
- PWA manifest + Service Worker
- README đầy đủ + deploy script
- `.env.example` template

### Phase 06 — Hybrid RAG + Parallel PDF OCR

**Đây là phase lớn nhất, là tâm điểm thay đổi gần đây.**

#### 6.1 Vector Embedding Infrastructure

- `lib/embeddings.ts`: Gemini `gemini-embedding-001`, 768 dim, Matryoshka
  - Task types: `RETRIEVAL_DOCUMENT` / `RETRIEVAL_QUERY`
  - Dùng REST API trực tiếp (không dùng SDK) để control `outputDimensionality`
  - Re-normalize sau truncate (Matryoshka requirement)
  - `embedBatch()` với concurrency limit
- `scripts/add-embedding-column.ts`: Migration thêm `vector(768)` column, tạo IVFFlat index khi >= 100 rows
- `scripts/backfill-embeddings.ts`: Backfill cho chunks cũ (chạy 1 lần sau nâng cấp)
- `actions/legal.ts`: Auto-embed sau upload, best-effort (không fail upload nếu embed fail)

#### 6.2 BM25 Standard Scoring

- `lib/rag-scoring.ts`: BM25 chuẩn với IDF + length normalization + header boost ×3
  - Tuned cho văn bản pháp luật VN (700-1500 chars/chunk)
  - `BM25_K1=1.5`, `BM25_B=0.75`
  - Match trong 200 ký tự đầu chunk (tên Điều) → nhân ×3

#### 6.3 Hybrid Retrieval

- `lib/rag-hybrid.ts`: Vector top-30 → BM25 re-rank → combine
  - Weights: `0.6 × cosine + 0.4 × BM25`
  - Fallback BM25-only nếu embedding không khả dụng
  - `CANDIDATE_POOL_SIZE=30` (lấy nhiều hơn để re-rank)

#### 6.4 Article Expansion

- `lib/rag-article-expansion.ts`: Giải pháp cho đặc thù VBPL VN
  - Hỏi 1 câu thường liên quan tới CẢ ĐIỀU chứ không chỉ 1 Khoản
  - Group chunks theo `(documentId, article)` → sort by `maxChunkScore`
  - Pull TOÀN BỘ Khoản của top-3 Điều (cap: 25 chunks/Điều, 20000 chars total)
  - `ALWAYS_INCLUDE_TOP_N=3`: top-3 Điều luôn include dù vượt nhẹ budget
  - Sort theo `maxChunkScore` (không dùng aggregate) để tránh bias Điều listing dài

#### 6.5 Conversation Context (Multi-turn)

- `lib/rag-conversation.ts`:
  - Load 5 Q-A gần nhất làm history
  - `isFollowUpQuestion()`: regex Vietnamese-aware + câu ≤ 4 từ
  - `buildChatMessages()`: multi-turn `ChatMessage[]` array, trim answer cũ 2500 chars
  - `getChunksFromPreviousSources()`: pull lại full Điều từ sources tin nhắn trước
- `lib/ai.ts`: Extend `streamChat()` hỗ trợ `messages[]` (multi-turn) + `userMessage` (backward compat)
- `maxTokens` nâng từ 1500 → 6000 cho câu trả lời đủ dài

#### 6.6 Chat Pipeline Update

- `app/api/ai/chat/route.ts`: Orchestrate 3-tier cascade fallback
  - Detect follow-up → reuse chunks (không retrieve lại)
  - `retrieveWithArticleExpansion()` → `retrieveHybrid()` → `retrieveRelevantChunks()`
  - Conversation management: tạo/lookup `Conversation` record, update `updatedAt`

#### 6.7 UI Update

- `components/ai/chat-interface.tsx`: Ẩn block "Trích dẫn" riêng
  - AI dẫn nguồn inline: `[150/2025/NĐ-CP, Điều 4, Khoản X]`

#### 6.8 Parallel PDF OCR

- `lib/pdf-batch-ocr.ts`: Worker pool pattern
  - Split PDF qua `pdf-lib` (parallel jobs creation)
  - `BATCH_SIZE=15` trang/batch, `MAX_CONCURRENCY=4`
  - Concurrency = `min(keyCount × 2, 4)` — tận dụng multi-key
  - PDF 200+ trang: 5 phút → 1-1.5 phút
  - Fast path: file nhỏ + ≤ 15 trang → OCR 1 lần

### Phase AI-1 — AI Agent Read Tools

- 6 read tools: `getTaskStats`, `getOverdueTasks`, `getMyTasks`, `getUserWorkload`, `getUBNDDirectives`, `searchLegalDocs`
- Agent loop trong `lib/ai-tools/agent.ts` — LLM function calling (Gemini/DeepSeek)
- `lib/ai-tools/registry.ts` — tool registry pattern
- `lib/ai-tools/types.ts` — ToolDefinition, ToolContext types
- `lib/ai-tools/system-prompt.ts` — buildAgentSystemPrompt role-aware
- Hybrid: tự fallback RAG nếu agent fail hoặc không match tool
- `requiresRole` guard: `getUserWorkload` chỉ TP/PTP/TBP
- AIAuditLog ghi log tất cả tool calls

### Phase AI-2 — AI Agent Write Tools + Confirmation UI

- 5 write tools: `createTask`, `updateTaskStatus`, `addProgressReport`, `createReminder`, `addTaskNote`
- **Stateless confirmation pattern:** dry-run preview → `<ConfirmationCard>` → POST `/api/ai/confirm-action`
- `updateTaskStatus` dùng action enum (`start | submit | confirm | reject | cancel`) — không nhận raw status
- `components/ai/confirmation-card.tsx` — UI confirm/hủy
- `app/api/ai/confirm-action/route.ts` — xác thực + execute thật

### Phase AI-3 — Background Risk Scanner

- `lib/ai-monitor/scanner.ts` — `runRiskScan()`: 7 risk types
- `app/api/cron/risk-scan/route.ts` — external cron trigger với `CRON_SECRET`
- Dedup 24h per (userId, type, entityId)
- Auto-mark OVERDUE trước khi scan
- Notification type `RISK_*` cho từng loại rủi ro
- AIAuditLog ghi mỗi lần scan

### Phase RBAC — Permission Matrix Overhaul

- **Permission matrix viết lại hoàn toàn:** tách `:all`/`:dept`/`:own` scope
- **Helpers mới:** `isTopLeader()`, `isDeptManager()`, `isStaff()`, `getManagedDepartments()`
- **Deprecated:** `isLeader()` — giữ backward compat, không dùng trong code mới
- **`User.managedDepartments Department[]`** — TBP quản nhiều dept (VD: Đinh Xuân Hội)
- **`buildScopeFilter`** cập nhật toàn bộ actions: task, ubnd, ihanoi, tthc, schedule, reports
- AI Agent: system prompt role-aware, tool `requiresRole`, scope-restricted cho NV
- Test: `scripts/test-rbac.ts`, `scripts/test-reports-scope.ts`

### Phase WF — Task Workflow + TP Confirmation

- **`TaskStatus.AWAITING_REVIEW`** — enum value mới (giữa IN_PROGRESS và COMPLETED)
- **Task fields mới:** `submittedAt`, `confirmedById`, `confirmedAt`
- **`performTaskAction(taskId, action)`** — state machine với VALID_STATUS_TRANSITIONS
- **`checkStatusTransitionPermission()`** — permission kiểm tra per action
- **`task-status-actions.tsx`** — workflow buttons: Bắt đầu / Gửi hoàn thành / Xác nhận / Yêu cầu làm lại
- Test: `scripts/test-review-workflow.ts`

### Phase TN — TaskNote (Lời nhắn lãnh đạo)

- **Prisma model `TaskNote`** — comment-thread style: nhiều note/task
- **Snapshot fields:** `authorName`, `authorPosition`, `authorRole` — immutable history
- **`isPinned`** — chỉ TP ghim
- **Permissions:** TP/PTP tạo all; TBP tạo trong dept; chỉ author sửa; author/TP xóa
- **Notification type `TASK_NOTE`** — gửi cho assignee
- **UI:** `<TaskNotesPanel>` right column, header khác nhau cho leader vs assignee
- **AI tool `addTaskNote`** trong write-tools (với dry-run confirmation)
- Test: `scripts/test-task-notes.ts`

---

## 3. Backlog — Phase 07+

### Phase AI-4 — Daily Morning Briefing (7AM)

AI tự động tóm tắt tình hình buổi sáng và push notification cho từng cán bộ lúc 7:00 AM:
- Tóm tắt task của mình hôm nay (deadline, status)
- Nhắc nhở task quá hạn/sắp hạn
- Thông tin mới từ UBND (nếu có)
- Trưởng phòng nhận briefing tổng quan phòng

Cơ chế: cron 7AM → gọi `/api/cron/morning-briefing` → LLM generate briefing per user → push notification

### Phase AI-5 — Auto-summary Weekly Report

AI tự động tổng hợp báo cáo tuần vào cuối ngày thứ Sáu:
- Pull tất cả progress reports tuần đó
- LLM generate tóm tắt súc tích cho TBP/TP
- Gửi notification với link báo cáo
- Giảm manual effort viết báo cáo

### Phase AI-6 — Predictive Risk (ML-based)

Nâng cấp risk scanner từ rule-based sang ML:
- Dự đoán task nào có khả năng trễ dựa trên pattern lịch sử
- Phân tích workload trend để cảnh báo overload sớm
- Recommend assignee phù hợp khi tạo task mới

---

### Phase 07 — iHanoi API Integration

**Lý do gác lại:** Cần API key + protocol chính thức từ UBND TP Hà Nội. Hiện cán bộ nhập tay.

Khi có API:
- Tự động sync phản ánh từ iHanoi API
- Webhook hoặc polling (cần nghiên cứu API của UBND TP)
- Schema `IHanoiComplaint` đã sẵn sàng, thêm `externalId` nếu cần

### Phase 07 — Real-time Notifications

Hiện tại: Notifications load khi page refresh (SSR). Cần push real-time khi được giao việc mới.

Các phương án:
- Server-Sent Events (SSE) cho notification stream
- WebSocket (phức tạp hơn, cần sticky session hoặc Redis pub/sub)
- Web Push API (hoạt động ngay cả khi app đóng — phù hợp PWA)

### Phase 08 — Security Enhancements

- **Audit log:** Ghi lại tất cả read/write operations (ai làm gì, khi nào). Cân nhắc GDPR/luật bảo vệ dữ liệu VN.
- **2FA / OTP:** Email OTP hoặc TOTP (Google Authenticator). Bật sau khi users quen hệ thống.
- **VBDXP / VNeID integration:** Xác thực qua VNeID nếu có yêu cầu chính thức.

### Phase 08 — RAG Quality Improvements

- **Cross-encoder re-ranking:** Dùng model cross-encoder để re-rank top-10 sau hybrid, cải thiện precision
- **Query expansion:** Sinh thêm các từ đồng nghĩa/liên quan cho query pháp lý trước khi embed
- **Citation verification:** Kiểm tra lại nguồn trích dẫn AI đề xuất so với chunks thực tế
- **Evaluation dataset:** Tạo bộ 100+ cặp Q&A chuẩn để đo mAP@k, NDCG của RAG

---

## 4. Technical Debt & Improvements

### Schema comment đã sửa

`app/prisma/schema.prisma` — comment `embedding` đã được cập nhật đúng:
```prisma
// Vector field for pgvector cosine similarity (768 dim, Gemini gemini-embedding-001 Matryoshka)
embedding  Unsupported("vector(768)")?
```

### `lib/rag.ts` legacy code

`lib/rag.ts` dùng TF score đơn giản (không phải BM25 chuẩn). File này còn tồn tại làm tầng 3 fallback. Không xóa vì backward compat. Document rõ trong code là "legacy fallback only".

### `isLeader()` deprecated

`lib/permissions.ts` vẫn export `isLeader()` cho backward compat. Code cũ dùng function này cần được migrate sang `isTopLeader()` / `isDeptManager()`. Tìm và thay thế khi có thời gian:
```bash
# Tìm usage còn lại
grep -r "isLeader(" app/
```

### IVFFlat index threshold

Index chỉ tạo khi >= 100 non-null embedding rows. Với corpus nhỏ (< 100 chunks), query vẫn hoạt động nhưng dùng sequential scan (chậm hơn). Khi corpus đủ lớn thì tự động tạo index.

### Conversation auto-delete

`Conversation` model có field `isPinned` nhưng chưa implement auto-delete cron cho conversations không pinned. Cần thêm cron job hoặc cleanup script.

### OCR error recovery

`pdf-batch-ocr.ts` skip batch thất bại nhưng không retry. Với các PDF có trang lỗi (scanned quality kém), không có retry mechanism. Cần thêm retry logic với backoff.

---

## 5. Quyết định kiến trúc đã thực hiện

### RAG: Additive architecture (không break existing)

**Quyết định:** Tất cả RAG improvements là files mới additive, giữ nguyên `lib/rag.ts` cũ làm fallback.

**Lý do:** Không muốn risk break production. Nếu hybrid RAG có bug → tự động fallback về BM25 cũ.

**Trade-off:** Code phức tạp hơn (3 files thay vì 1). Acceptable vì RAG quality quan trọng hơn code simplicity.

### BM25 re-rank trên tập candidates (không phải full corpus)

**Quyết định:** `rag-hybrid.ts` fetch top-30 qua vector search, sau đó BM25 re-rank trên 30 candidates đó.

**Lý do:** Full corpus BM25 chậm (phải load tất cả chunks). Re-rank trên candidates nhanh hơn nhiều và kết quả tốt hơn vì đã lọc qua semantic similarity.

**Trade-off:** Có thể miss some keyword matches nếu vector search bỏ qua. Acceptable vì vector search rất tốt cho VN pháp lý text.

### Sort buckets theo maxChunkScore (không phải aggregate)

**Quyết định:** `rag-article-expansion.ts` sort theo `maxChunkScore` thay vì `aggregateScore` hoặc `matchedCount`.

**Lý do:** Bias test cho thấy Điều dạng "listing" (có 13 Khoản, mỗi Khoản 1 dòng) thắng Điều "definition" (1 chunk ngắn nhưng định nghĩa chính xác câu hỏi) khi dùng aggregate/count multiplier.

### maxTokens = 6000

**Quyết định:** Nâng từ 1500 lên 6000 tokens cho LLM response.

**Lý do:** Văn bản pháp lý VN thường có nhiều Khoản, Điểm. 1500 tokens dẫn đến AI bị cắt ngang giữa chừng.

**Trade-off:** Tốn thêm chi phí API (~4x). Acceptable vì chất lượng câu trả lời quan trọng hơn với cán bộ pháp lý.

### Provider info ẩn hoàn toàn

**Quyết định:** User không bao giờ biết AI provider/model đang dùng. Server tự chọn.

**Lý do:** Ứng dụng cho cán bộ nhà nước — bảo mật tuyệt đối. Không để kẻ tấn công biết vendor để target đúng API. Cũng cho phép thay đổi provider mà không ảnh hưởng UX.

### Data sovereignty — no cloud DB

**Quyết định:** Tất cả dữ liệu tự host, không dùng Supabase, PlanetScale, hoặc any managed cloud DB.

**Lý do:** Yêu cầu pháp lý và chính sách UBND — dữ liệu hành chính xã không được rời khỏi hạ tầng nội bộ.

**Exception chấp nhận:** Gọi Gemini API bên ngoài cho embedding và OCR là chấp nhận được vì chỉ gửi text chunks/PDF (không gửi dữ liệu cán bộ/công dân nhận dạng được).
