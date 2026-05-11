# Codebase Summary

**Dự án:** App Quản Lý Phòng Kinh Tế Xã Trần Phú
**Cập nhật:** 2026-05-11
**Tech stack:** Next.js 16 App Router + TypeScript + PostgreSQL 16 + Prisma 6 + Better Auth + shadcn/ui + AI Agent (Gemini 2.5 Flash / DeepSeek / Anthropic)

---

## Mục lục

1. [Cấu trúc thư mục tổng quan](#1-cấu-trúc-thư-mục-tổng-quan)
2. [Pages — Next.js App Router](#2-pages--nextjs-app-router)
3. [Components — UI & Layout](#3-components--ui--layout)
4. [lib — Core Utilities & Business Logic](#4-lib--core-utilities--business-logic)
5. [actions — Server Actions](#5-actions--server-actions)
6. [api — API Routes](#6-api--api-routes)
7. [scripts — Migration & Test Scripts](#7-scripts--migration--test-scripts)
8. [prisma — Schema & Seed](#8-prisma--schema--seed)
9. [Prisma Models Chi Tiết](#9-prisma-models-chi-tiết)
10. [AI Tools Stack](#10-ai-tools-stack)

---

## 1. Cấu trúc thư mục tổng quan

```
app/                             ← Next.js project root
├── app/                         ← App Router pages
│   ├── layout.tsx               ← Root layout (Noto Sans, PWA metadata, viewport)
│   ├── (auth)/                  ← Route group: trang không có sidebar
│   │   └── login/
│   │       ├── page.tsx         ← Trang đăng nhập
│   │       └── login-form.tsx   ← Form đăng nhập (client component)
│   ├── (dashboard)/             ← Route group: trang có sidebar + header + bottom-nav
│   │   ├── layout.tsx           ← Dashboard layout (auth check, notification count)
│   │   ├── page.tsx             ← Dashboard home (thống kê overview)
│   │   ├── tasks/               ← Module quản lý nhiệm vụ
│   │   ├── ubnd/                ← Module nhiệm vụ UBND
│   │   ├── ihanoi/              ← Module phản ánh iHanoi
│   │   ├── tthc/                ← Module hồ sơ TTHC
│   │   ├── schedule/            ← Module lịch công tác
│   │   ├── reports/             ← Module báo cáo
│   │   ├── ai/                  ← Module trợ lý AI pháp lý
│   │   ├── legal/               ← Module quản lý văn bản pháp lý
│   │   ├── users/               ← Quản lý người dùng (chỉ TRUONG_PHONG)
│   │   ├── notifications/       ← Xem thông báo
│   │   ├── profile/             ← Hồ sơ + đổi mật khẩu
│   │   ├── settings/            ← Cài đặt hệ thống
│   │   └── menu/                ← Mobile full menu page
│   └── api/                     ← API Routes
│       ├── auth/[...all]/       ← Better Auth handler
│       ├── ai/chat/             ← AI chat streaming (SSE) — Agent + Hybrid RAG pipeline
│       ├── ai/status/           ← AI availability check
│       ├── ai/confirm-action/   ← Xác nhận write tool (stateless confirmation)
│       └── cron/risk-scan/      ← Background risk scanner (gọi từ external cron)
│
├── components/                  ← React components
│   ├── ui/                      ← shadcn/ui base components
│   ├── layout/                  ← Sidebar, BottomNav, Header, PageHeader
│   ├── task/                    ← Components cho task module
│   │   ├── task-notes-panel.tsx ← Lời nhắn panel (right column task detail)
│   │   ├── task-note-form.tsx   ← Form gửi lời nhắn
│   │   ├── task-note-item.tsx   ← Render 1 note với pin/edit/delete
│   │   └── task-status-actions.tsx ← Workflow buttons (start/submit/confirm/reject)
│   ├── ubnd/                    ← Components cho UBND module
│   ├── ihanoi/                  ← Components cho iHanoi module
│   ├── tthc/                    ← Components cho TTHC module
│   ├── schedule/                ← Components cho lịch công tác
│   ├── reports/                 ← Components cho báo cáo
│   ├── notification/            ← Components thông báo
│   ├── settings/                ← Components cài đặt
│   ├── legal/                   ← Components văn bản pháp lý
│   ├── ai/                      ← AI chat interface + agent UI
│   │   ├── chat-interface.tsx   ← Chat UI streaming SSE, history
│   │   ├── confirmation-card.tsx← Stateless confirmation UI cho write tools
│   │   └── conversation-sidebar.tsx ← Danh sách conversations
│   └── filters/                 ← Reusable filter components
│
├── lib/                         ← Utilities & business logic
│   ├── auth.ts                  ← Better Auth config
│   ├── auth-client.ts           ← Better Auth client-side
│   ├── db.ts                    ← Prisma client singleton
│   ├── session.ts               ← Server-side session helpers
│   ├── permissions.ts           ← RBAC permission matrix (37 permissions, helpers mới)
│   ├── ai.ts                    ← Multi-provider AI abstraction (multi-turn messages)
│   ├── api-key-rotator.ts       ← Round-robin key rotation + cooldown (429/401/5xx)
│   ├── rag.ts                   ← Legacy BM25 RAG (fallback tầng 3)
│   ├── rag-scoring.ts           ← BM25 chuẩn: IDF + length norm + header boost ×3
│   ├── rag-hybrid.ts            ← Hybrid: vector top-30 → BM25 re-rank → combine
│   ├── rag-article-expansion.ts ← Article expansion: pull full Điều cho top-3 articles
│   ├── rag-conversation.ts      ← Multi-turn context: detect follow-up, reuse chunks
│   ├── embeddings.ts            ← Gemini gemini-embedding-001, 768 dim, Matryoshka
│   ├── legal-parser.ts          ← Vietnamese legal text chunking
│   ├── pdf-ocr.ts               ← Wrapper Gemini Vision OCR (single batch)
│   ├── pdf-batch-ocr.ts         ← Parallel OCR: worker pool, BATCH_SIZE 15, concurrency 4
│   ├── ai-legal-extract.ts      ← Extract metadata từ legal text
│   ├── vn-legal-parser.ts       ← Vietnamese legal structure parser
│   ├── date-range.ts            ← Date range presets utility
│   ├── rate-limiter.ts          ← Rate limiter cho API routes
│   ├── sidebar-badges.ts        ← Badge counts cho sidebar navigation
│   ├── utils.ts                 ← cn(), getWeekNumber(), misc
│   ├── ai-tools/                ← AI Agent stack (Phase AI-1/2)
│   │   ├── agent.ts             ← Agent loop: parse intent → pick tool → execute → stream
│   │   ├── registry.ts          ← Tool registry: map toolName → ToolDefinition
│   │   ├── types.ts             ← ToolDefinition, ToolContext, DryRunResult types
│   │   ├── system-prompt.ts     ← buildAgentSystemPrompt(user) — role-aware prompt
│   │   └── tools/
│   │       ├── task-tools.ts    ← Read tools: getTaskStats, getOverdueTasks, getMyTasks, getUserWorkload
│   │       ├── ubnd-tools.ts    ← Read tools: getUBNDDirectives
│   │       ├── legal-tools.ts   ← Read tools: searchLegalDocs
│   │       └── write-tools.ts   ← Write tools: createTask, updateTaskStatus, addProgressReport, createReminder, addTaskNote
│   ├── ai-monitor/              ← Background Risk Scanner (Phase AI-3)
│   │   └── scanner.ts           ← runRiskScan(): 7 risk types, dedup 24h, audit log
│   └── validations/
│       ├── task.ts              ← Zod schemas cho task actions
│       └── task-note.ts         ← Zod schemas cho TaskNote actions
│
├── actions/                     ← Next.js Server Actions
│   ├── task.ts                  ← CRUD tasks, workflow state machine, scope filter
│   ├── task-note.ts             ← CRUD TaskNote (lời nhắn lãnh đạo)
│   ├── ubnd.ts                  ← CRUD UBND directives
│   ├── ihanoi.ts                ← CRUD iHanoi complaints
│   ├── tthc.ts                  ← CRUD TTHC records
│   ├── schedule.ts              ← CRUD work schedules
│   ├── notification.ts          ← Read/mark notifications
│   ├── conversation.ts          ← Manage AI conversations
│   └── legal.ts                 ← Upload + auto-embed + manage legal documents
│
├── prisma/
│   ├── schema.prisma            ← 15 models + 6 enums + pgvector extension
│   └── seed.ts                  ← Seed 21 users + 2 task groups
│
├── scripts/                     ← Migration & test scripts
│   ├── add-embedding-column.ts  ← One-time migration: thêm vector(768) column
│   ├── backfill-embeddings.ts   ← Backfill embeddings cho chunks cũ
│   ├── test-hybrid-rag.ts       ← Test hybrid retrieval
│   ├── test-article-expansion.ts← Test article expansion
│   ├── test-conversation-context.ts ← Test conversation context
│   └── ...                      ← Các test scripts khác
│
├── public/
│   ├── manifest.json            ← PWA manifest
│   └── icons/                   ← PWA icons (192x192, 512x512)
│
├── next.config.ts               ← Next.js config (PWA, image domains)
├── tsconfig.json                ← TypeScript strict mode
└── .env.example                 ← Template env vars
```

---

## 2. Pages — Next.js App Router

Tất cả pages trong `(dashboard)/` đều là **Server Components** mặc định, gọi `requireAuth()` và truy vấn DB trực tiếp.

### Route Group: (auth)

| File | Mô tả |
|------|-------|
| `app/(auth)/login/page.tsx` | Trang đăng nhập — render `<LoginForm />` |
| `app/(auth)/login/login-form.tsx` | Client component form email/password, gọi Better Auth `signIn.email()` |

### Route Group: (dashboard)

| File | Mô tả |
|------|-------|
| `app/(dashboard)/layout.tsx` | Layout wrapper: `requireAuth()`, đếm unread notifications, render Sidebar + BottomNav + Header |
| `app/(dashboard)/page.tsx` | Dashboard home: 4 stat cards + thống kê cán bộ/UBND (cho leader) + trách nhiệm phụ trách |
| `app/(dashboard)/tasks/page.tsx` | Danh sách nhiệm vụ với tabs + DateRangeFilter + search |
| `app/(dashboard)/tasks/[id]/page.tsx` | Chi tiết nhiệm vụ + progress reports + sub-tasks |
| `app/(dashboard)/ubnd/page.tsx` | Danh sách nhiệm vụ UBND với filter trạng thái |
| `app/(dashboard)/ubnd/new/page.tsx` | Form tạo nhiệm vụ UBND mới |
| `app/(dashboard)/ubnd/[id]/page.tsx` | Chi tiết + response form cho UBND directive |
| `app/(dashboard)/ihanoi/page.tsx` | Danh sách phản ánh iHanoi |
| `app/(dashboard)/ihanoi/new/page.tsx` | Form nhập phản ánh iHanoi |
| `app/(dashboard)/ihanoi/[id]/page.tsx` | Chi tiết + form xử lý kết quả |
| `app/(dashboard)/tthc/page.tsx` | Danh sách hồ sơ TTHC |
| `app/(dashboard)/tthc/new/page.tsx` | Form tiếp nhận hồ sơ mới |
| `app/(dashboard)/tthc/[id]/page.tsx` | Chi tiết hồ sơ + cập nhật trạng thái |
| `app/(dashboard)/schedule/page.tsx` | Lịch công tác tuần/tháng |
| `app/(dashboard)/reports/page.tsx` | Trang báo cáo tổng hợp |
| `app/(dashboard)/reports/tasks/page.tsx` | Báo cáo chi tiết công việc + xuất CSV |
| `app/(dashboard)/ai/page.tsx` | Chat interface trợ lý AI pháp lý (Hybrid RAG) |
| `app/(dashboard)/legal/page.tsx` | Danh sách văn bản pháp lý đã upload |
| `app/(dashboard)/legal/upload/page.tsx` | Form upload văn bản pháp lý mới |
| `app/(dashboard)/users/page.tsx` | Quản lý 21 cán bộ (chỉ TRUONG_PHONG) |
| `app/(dashboard)/notifications/page.tsx` | Danh sách thông báo + mark all read |
| `app/(dashboard)/profile/page.tsx` | Hồ sơ cá nhân + form đổi mật khẩu |
| `app/(dashboard)/settings/page.tsx` | Cài đặt hệ thống |
| `app/(dashboard)/menu/page.tsx` | Mobile full menu (tất cả menu items) |

---

## 3. Components — UI & Layout

### Layout Components (`components/layout/`)

| File | Mô tả |
|------|-------|
| `sidebar.tsx` | Desktop sidebar (hiện trên `md:`), hiển thị nav items theo `role`, avatar user |
| `bottom-nav.tsx` | Mobile bottom navigation bar (ẩn trên `md:`), 5 items + active state |
| `header.tsx` | Top header — mobile menu button, tiêu đề trang, notification bell với badge count |
| `page-header.tsx` | Reusable page header với title + description + optional actions slot |

### UI Base Components (`components/ui/`)

shadcn/ui components: `button`, `input`, `label`, `card`, `badge`, `avatar`, `dropdown-menu`, `textarea`, `select`, `dialog`, `progress`, `calendar`.

### AI Components (`components/ai/`)

| File | Mô tả |
|------|-------|
| `chat-interface.tsx` | Chat UI với streaming SSE, history conversations, agent tool results. Block "Trích dẫn" ẩn — AI dẫn nguồn inline. maxTokens = 6000. |
| `confirmation-card.tsx` | Stateless confirmation UI: hiển thị preview DryRunResult, nút "Xác nhận" / "Hủy". Render khi AI trả về `__pendingAction`. |
| `conversation-sidebar.tsx` | Sidebar danh sách conversations, nút tạo mới, pin/unpin |
| `markdown-content.tsx` | Render markdown response của AI (code blocks, tables, headings) |

### Legal Components (`components/legal/`)

| File | Mô tả |
|------|-------|
| `legal-upload-form.tsx` | Form upload văn bản + metadata. Sau submit tự động trigger embedding generation (best-effort, không block) |

### Reusable Filter Components (`components/filters/`)

| File | Mô tả |
|------|-------|
| `date-range-filter.tsx` | **Client component.** Bộ lọc thời gian reusable — preset buttons (Hôm nay / Hôm qua / Tuần này / Tháng này) + calendar range picker. Đồng bộ state qua URL search params. |

### Task Components (`components/task/`)

| File | Mô tả |
|------|-------|
| `task-list.tsx` | Danh sách nhiệm vụ dạng card, status badge, assignee, deadline countdown |
| `task-form.tsx` | Form tạo/sửa nhiệm vụ với validation |
| `new-task-dialog.tsx` | Modal dialog tạo nhiệm vụ mới |
| `status-badge.tsx` | Badge màu theo `TaskStatus` (bao gồm AWAITING_REVIEW mới) |
| `progress-report-form.tsx` | Form cập nhật % tiến độ + ghi chú + vướng mắc |
| `task-status-actions.tsx` | Workflow action buttons: "Bắt đầu" / "Gửi hoàn thành" / "Xác nhận" / "Yêu cầu làm lại" — hiển thị theo role + trạng thái hiện tại |
| `task-notes-panel.tsx` | Panel lời nhắn bên phải task detail. Header "Lời nhắn (N)" cho leader / "Lời nhắn dành cho bạn (N)" cho assignee |
| `task-note-form.tsx` | Form gửi lời nhắn mới (hiện cho leader) |
| `task-note-item.tsx` | Render 1 note: pin badge, author snapshot, edit/delete menu |
| `task-filter-bar.tsx` | Filter bar: status tabs, date range, search |

### Domain Components

| Thư mục | Components |
|---------|-----------|
| `components/ubnd/` | `ubnd-form.tsx`, `ubnd-response-form.tsx` |
| `components/ihanoi/` | `ihanoi-form.tsx`, `ihanoi-resolve-form.tsx` |
| `components/tthc/` | `tthc-form.tsx`, `tthc-status-actions.tsx` |
| `components/schedule/` | `schedule-form.tsx`, `schedule-item.tsx` |
| `components/reports/` | `export-csv-button.tsx` |
| `components/notification/` | `mark-all-read.tsx` |
| `components/settings/` | `change-password-form.tsx` |

---

## 4. lib — Core Utilities & Business Logic

### `app/lib/auth.ts`

Better Auth configuration:
- `emailAndPassword`: scrypt hash, min 6 ký tự
- `session.expiresIn`: 7 ngày, cookie prefix `pkt`
- `user.additionalFields`: tất cả custom fields (role, department, position, fields, areas, teamGroupCode, isTeamLeader, responsibilities, isActive, phone)
- `trustedOrigins`: localhost + env vars `BETTER_AUTH_URL` và `NEXT_PUBLIC_APP_URL`

### `app/lib/auth-client.ts`

Client-side Better Auth instance. Dùng cho `login-form.tsx` và các client components cần gọi auth actions.

### `app/lib/db.ts`

Prisma client singleton — pattern chuẩn để tránh nhiều connections trong hot-reload Next.js dev.

### `app/lib/session.ts`

Server-side session utilities:

| Function | Mô tả |
|----------|-------|
| `getCurrentUser()` | Lấy user từ session hiện tại, trả `null` nếu chưa login |
| `requireAuth()` | Lấy user hoặc redirect `/login`; kiểm tra `isActive` |
| `requireRole(...allowed)` | Kiểm tra role, redirect `/?error=forbidden` nếu không đủ quyền |
| `requirePermission(permission)` | Kiểm tra permission cụ thể từ PERMISSION_MATRIX |

### `app/lib/permissions.ts`

RBAC core (đã viết lại hoàn toàn):
- `ROLE_LEVELS`: số thứ tự cấp bậc (TRUONG_PHONG=1 đến NHAN_VIEN=5)
- `DEPARTMENT_LABELS`: tên hiển thị tiếng Việt cho 4 bộ phận
- `Permission` type: 37 permission keys với scope suffix `:all`/`:dept`/`:own`
- `PERMISSION_MATRIX`: mapping `Role → Permission[]` cho 5 roles (xem chi tiết docs/project-overview-pdr.md#ma-trận-quyền-hạn)
- **Helpers mới:**
  - `isTopLeader(role)` — TP hoặc PTP (toàn quyền phòng)
  - `isDeptManager(role)` — TRUONG_BO_PHAN (quyền trong dept)
  - `isStaff(role)` — CV hoặc NV (chỉ quyền cá nhân)
  - `getManagedDepartments(user)` — trả danh sách dept TBP quản lý (hỗ trợ multi-dept)
  - `hasPermission()`, `canViewAllTasks()`, `canAssignTask()`, `canManageUsers()`, `canUseAI()`, `isAdmin()`
- **Deprecated:** `isLeader()` — giữ cho backward compat nhưng không dùng trong code mới

### `app/lib/api-key-rotator.ts`

Round-robin API key rotator với failure tracking và smart cooldown:

| Cooldown | Trigger |
|----------|---------|
| 5 phút | HTTP 429 (rate limit) hoặc "quota exceeded" |
| 24 giờ | HTTP 401/403 hoặc "invalid key" (admin cần fix) |
| 30 giây | HTTP 5xx (server error) |
| 1 phút | Các lỗi khác |

Singleton rotators: `getGeminiRotator()`, `getAnthropicRotator()`, `getDeepSeekRotator()`.  
Hỗ trợ nhiều key phân tách bằng comma/semicolon trong 1 env var (vd `GEMINI_API_KEYS=key1,key2,key3`).

### `app/lib/ai.ts`

Multi-provider AI abstraction — **server-only module**:

| Export | Mô tả |
|--------|-------|
| `AIProvider` type | `"anthropic" \| "gemini" \| "deepseek"` |
| `AI_MODELS` | Model IDs: `claude-sonnet-4-5`, `gemini-2.5-flash`, `deepseek-chat` |
| `ChatMessage` type | `{ role: "user" \| "assistant", content: string }` — dùng cho multi-turn |
| `getActiveProvider()` | Auto-select: ưu tiên `AI_PROVIDER` env → Gemini → DeepSeek → Anthropic |
| `streamChat(opts)` | Hỗ trợ `messages[]` (multi-turn) hoặc `userMessage` (backward compat). Dispatch đến provider đúng, streaming via `onChunk` callback |

### `app/lib/embeddings.ts` (NEW)

Embedding via Gemini `gemini-embedding-001`:
- Dimension: 768 (Matryoshka truncation, re-normalize sau truncate)
- Task types: `RETRIEVAL_DOCUMENT` (khi index chunks) và `RETRIEVAL_QUERY` (khi query)
- Dùng REST API trực tiếp (SDK cũ chưa support `outputDimensionality`)
- `embedText(text, taskType)` — embed 1 text, trả `number[] | null`
- `embedBatch(texts, taskType, concurrency=4)` — embed song song, trả array cùng độ dài
- `vectorToSql(vec)` — format `[0.1, 0.2, ...]` cho pgvector SQL literal
- `isEmbeddingAvailable()` — kiểm tra có Gemini key khả dụng không

### `app/lib/rag-scoring.ts` (NEW)

BM25 chuẩn (additive, không sửa `rag.ts` cũ):
- Hyperparams: `BM25_K1=1.5`, `BM25_B=0.75`
- Article header boost: match keyword trong 200 ký tự đầu của chunk → nhân ×3 (`HEADER_BOOST_FACTOR=3`)
- `bm25Score(query, inputs)` — score tất cả chunks, sort DESC
- `normalizeBm25(scored)` — normalize về `[0, 1]` dựa trên max score

### `app/lib/rag-hybrid.ts` (NEW)

Hybrid retrieval kết hợp vector cosine và BM25:

```
Query
  ↓ embedText(query, "RETRIEVAL_QUERY")
  ↓ vector search top-30 via pgvector cosine (<=>)
  ↓ BM25 re-rank TRÊN TẬP 30 CANDIDATES (không phải full corpus)
  ↓ combine: 0.6 × cosineNorm + 0.4 × bm25Norm
  ↓ sort DESC → top-K
```

Fallback về BM25-only (`fallbackBm25Only`) nếu embedding không khả dụng.

### `app/lib/rag-article-expansion.ts` (NEW)

Article expansion — đặc thù VBPL: hỏi về 1 Khoản thường cần đọc cả Điều:

```
retrieveHybrid(query, CANDIDATE_K=15)
  ↓ Group theo (documentId, article)
  ↓ Sort buckets: maxChunkScore DESC, tie-break matchedCount
  ↓ Pick top-3 articles
  ↓ Pull FULL chunks của mỗi Điều (cap 25 chunks/Điều, 20000 chars total)
  ↓ Return ArticleGroup[]
```

Key constants: `CANDIDATE_K=15`, `MAX_ARTICLES=3`, `MAX_TOTAL_CHARS=20000`, `MAX_CHUNKS_PER_ARTICLE=25`, `ALWAYS_INCLUDE_TOP_N=3`.

### `app/lib/rag-conversation.ts` (NEW)

Multi-turn conversation context:

| Function | Mô tả |
|----------|-------|
| `isFollowUpQuestion(question, hasHistory)` | Heuristic detect follow-up: regex Vietnamese-aware (tóm tắt, ngắn hơn, ví dụ, vậy còn...) + câu ≤ 4 từ |
| `loadConversationHistory(conversationId, limit=5)` | Load 5 cặp Q-A gần nhất, sort cũ → mới |
| `buildChatMessages(history, currentUserMessage)` | Build `ChatMessage[]` cho LLM, trim answer cũ xuống 2500 ký tự |
| `getChunksFromPreviousSources(prevSources)` | Pull full Điều từ sources của tin nhắn trước — dùng khi follow-up |

### `app/lib/rag.ts`

Legacy BM25 (vẫn giữ làm tầng 3 fallback). Dùng TF + title boost + coverage bonus (không phải BM25 chuẩn). KHÔNG sửa file này.

### `app/lib/legal-parser.ts`

Vietnamese legal text processing:

| Function | Mô tả |
|----------|-------|
| `chunkLegalText(text)` | Split theo Điều/Khoản. Điều ngắn (< 1500 chars) = 1 chunk; dài thì split theo Khoản. Fallback: chunk theo độ dài |
| `tokenize(text)` | Lowercase + remove diacritics (NFD normalize) + split by space |
| `tokenizeKeywords(text)` | `tokenize()` + filter ~100 stopwords tiếng Việt |

### `app/lib/pdf-batch-ocr.ts` (NEW)

Parallel OCR cho PDF lớn — worker pool pattern:

| Constant | Giá trị | Lý do |
|----------|---------|-------|
| `BATCH_SIZE` | 15 trang | Cân bằng giữa tốc độ 1 batch và số batch song song |
| `MAX_CONCURRENCY` | 4 | Trần dù có nhiều key (tránh quota burst) |
| `MIN_CONCURRENCY` | 2 | Tối thiểu 2 song song dù chỉ 1 key |

Concurrency thực tế = `min(keyCount × 2, MAX_CONCURRENCY)`. Kết quả: PDF 200+ trang từ ~5 phút → ~1–1.5 phút.

Fast path: file nhỏ (< 18MB) và ≤ 15 trang → OCR 1 lần, không split.

### `app/lib/pdf-ocr.ts`

Wrapper đơn giản gọi Gemini Vision OCR cho 1 batch. `batchOCRPDF` trong `pdf-batch-ocr.ts` dùng `ocrSingleBuffer` gọi qua `APIKeyRotator`.

### `app/lib/date-range.ts`

| Export | Mô tả |
|--------|-------|
| `DateRangePreset` type | `"today" \| "yesterday" \| "this-week" \| "this-month" \| "custom" \| "all"` |
| `computeDateRange(preset, from?, to?)` | Tính `{ from, to, label }` — tuần bắt đầu thứ Hai (chuẩn VN) |
| `parseDateRangeParams(params)` | Parse từ URL searchParams (dùng trong Server Components) |

---

## 5. actions — Server Actions

Tất cả files đều có `"use server"` directive. Pattern chuẩn:

```
"use server"
1. requireAuth() / requirePermission()  ← Xác thực + kiểm tra quyền
2. schema.parse(input)                  ← Validate input với Zod
3. db.model.create/update               ← Database operation
4. revalidatePath(...)                  ← Invalidate Next.js cache
5. return { success: true, ... } | { error: string }
```

### `app/actions/legal.ts`

| Function | Mô tả |
|----------|-------|
| `uploadLegalDocument(input)` | Upload văn bản → `chunkLegalText()` → `db.legalDocument.create()` với chunks → **auto-embed** tất cả chunks qua `embedBatch()` (best-effort, không fail upload nếu embed fail) → `revalidatePath("/legal")` |
| `deleteLegalDocument(id)` | Xóa document + cascading chunks |
| `setLegalStatus(id, status)` | Cập nhật status: `"active"` / `"superseded"` / `"expired"` |

**Lưu ý quan trọng:** Sau `uploadLegalDocument()`, chunks mới đã có embedding ngay — KHÔNG cần chạy `backfill-embeddings.ts` cho văn bản mới upload.

### `app/actions/task.ts`

| Function | Mô tả |
|----------|-------|
| `createTask(input)` | Tạo task + Notification cho assignee/nhóm. Chỉ `task:create` (TBP trở lên) |
| `updateTask(input)` | Sửa metadata task — chỉ creator/TP/PTP |
| `deleteTask(id)` | Soft delete (`deletedAt = now()`) — chỉ `task:delete` (TP) |
| `performTaskAction(taskId, action)` | State machine: `action` ∈ {`start`, `submit`, `confirm`, `reject`, `cancel`}. Kiểm tra `VALID_STATUS_TRANSITIONS` + `checkStatusTransitionPermission()`. Cập nhật `submittedAt`/`confirmedById`/`confirmedAt` khi cần. |
| `addProgressReport(input)` | Thêm báo cáo tiến độ — chỉ assignee của task |
| `getTasks(filters)` | Lấy task list với `buildScopeFilter(user)` — tự động scope theo role |
| `getTaskCounts(filters)` | Đếm tasks theo từng status (bao gồm AWAITING_REVIEW) |
| `markOverdueTasks()` | Batch update tasks quá deadline sang OVERDUE |

### `app/actions/task-note.ts`

| Function | Mô tả |
|----------|-------|
| `createTaskNote(input)` | Tạo lời nhắn — TP/PTP all, TBP trong dept. Notification `TASK_NOTE` cho assignee |
| `updateTaskNote(id, content)` | Sửa note — chỉ author |
| `deleteTaskNote(id)` | Xóa — author hoặc TP |
| `pinTaskNote(id, isPinned)` | Ghim/bỏ ghim — chỉ TP |
| `getTaskNotes(taskId)` | Lấy notes của task: pinned trước, mới nhất sau |

### `app/actions/ubnd.ts`

CRUD cho `UBNDDirective`: tạo, cập nhật, giao assignee, ghi phản hồi, soft delete.

### `app/actions/ihanoi.ts`

CRUD cho `IHanoiComplaint`: tạo, giao xử lý, cập nhật kết quả, filter.

### `app/actions/tthc.ts`

CRUD cho `TTHCRecord`: tiếp nhận, cập nhật trạng thái `RECEIVED → PROCESSING → COMPLETED/RETURNED`.

### `app/actions/schedule.ts`

CRUD cho `WorkSchedule`: tạo/sửa/xóa lịch cá nhân, lấy theo tuần/tháng.

### `app/actions/notification.ts`

`getNotifications()`, `markNotificationRead(id)`, `markAllNotificationsRead()`.

### `app/actions/conversation.ts`

Quản lý AI conversations: tạo mới, lấy danh sách, xóa, pin/unpin.

---

## 6. api — API Routes

### `app/api/auth/[...all]/route.ts`

Better Auth catch-all handler cho tất cả auth endpoints.

### `app/api/ai/chat/route.ts`

AI chat streaming endpoint (SSE) — Agent + Hybrid RAG pipeline:

**Input:** `POST { question: string, conversationId?: string }`

**Pipeline:**
1. Auth check (`canUseAI(role)`) — NHAN_VIEN không có `ai:full` → reject (chỉ `ai:limited`)
2. Thử Agent loop (`lib/ai-tools/agent.ts`): parse intent → gọi tool nếu nhận dạng được → stream result
3. **Nếu agent fail hoặc không match tool:** fallback về RAG pipeline (3 tầng)
   - `retrieveWithArticleExpansion()` → `retrieveHybrid()` → `retrieveRelevantChunks()`
4. Write tool trả về `DryRunResult` với `__pendingAction` → stream pending event → UI hiển thị `<ConfirmationCard>`
5. `streamChat({ messages, maxTokens: 6000 })` → SSE stream

**SSE events:** `{ conversationId, sources }` → `{ text }` × N → `{ pendingAction }` (nếu write tool) → `[DONE]`

**Bảo mật:** server tự chọn provider (`getActiveProvider()`), KHÔNG tiết lộ tên model/provider.

### `app/api/ai/status/route.ts`

`GET` — Trả `{ available: boolean }` — KHÔNG tiết lộ provider/model.

### `app/api/ai/confirm-action/route.ts`

**Stateless confirmation endpoint:**
- `POST { pendingAction: object, confirmed: boolean }`
- Validate lại input (không tin client)
- Gọi tool `executeTool(toolName, input, { confirmed: true })`
- Trả `{ success, result }` hoặc `{ error }`
- Ghi `AIAuditLog` cho mọi confirmed action

### `app/api/cron/risk-scan/route.ts`

**Background risk scanner — external cron trigger:**
- `GET /api/cron/risk-scan?secret=CRON_SECRET`
- Xác thực `CRON_SECRET` env var — reject nếu sai
- Gọi `runRiskScan()` từ `lib/ai-monitor/scanner.ts`
- 7 risk types, dedup 24h, auto-mark OVERDUE trước scan
- Trả `{ scanned, notifications, duration }`
- Setup: xem [`app/docs/ai-monitor-cron.md`](../app/docs/ai-monitor-cron.md)

---

## 7. scripts — Migration & Test Scripts

| Script | Mô tả | Khi chạy |
|--------|-------|----------|
| `scripts/add-embedding-column.ts` | Thêm `vector(768)` column vào `legal_chunks`. Idempotent. Tạo IVFFlat index khi >= 100 rows | Một lần sau deploy mới |
| `scripts/backfill-embeddings.ts` | Sinh embeddings cho các chunks cũ (trước khi upgrade) | Một lần sau nâng cấp từ phase 04→06 |
| `scripts/test-hybrid-rag.ts` | Test end-to-end hybrid retrieval | Debug RAG quality |
| `scripts/test-article-expansion.ts` | Test article expansion pipeline | Debug article grouping |
| `scripts/test-conversation-context.ts` | Test follow-up detection + chunk reuse | Debug multi-turn |
| `scripts/test-embedding.ts` | Test kết nối Gemini embedding API | Verify env setup |
| `scripts/test-rag.ts` | Test legacy BM25 RAG | Debug baseline |
| `scripts/test-ocr.ts` | Test Gemini Vision OCR | Debug PDF parsing |
| `scripts/diagnose-rag.ts` | Diagnose RAG query pipeline | Debug production issues |
| `scripts/test-agent.ts` | Test AI agent read tools (getTaskStats, getMyTasks...) | Debug agent |
| `scripts/test-agent-write.ts` | Test AI agent write tools + dry-run flow | Debug write tools |
| `scripts/test-write-tools.ts` | Unit test createTask/updateTaskStatus/addProgressReport | Debug write tools |
| `scripts/test-review-workflow.ts` | Test task workflow state machine (start/submit/confirm) | Debug workflow |
| `scripts/test-rbac.ts` | Test toàn bộ permission matrix 5 role × 37 permissions | Verify RBAC |
| `scripts/test-reports-scope.ts` | Test scope filter cho reports theo role | Debug scope |
| `scripts/test-schedule-scope.ts` | Test scope filter cho lịch theo role | Debug scope |
| `scripts/test-risk-scanner.ts` | Test background risk scanner: 7 types, dedup | Debug scanner |
| `scripts/test-task-notes.ts` | Test TaskNote CRUD + permission + notification | Debug notes |
| `scripts/list-users.ts` | Liệt kê 21 users + role + department | Debug seed |
| `scripts/test-sidebar-badges.ts` | Test badge count trên sidebar | Debug badges |

---

## 8. prisma — Schema & Seed

### `app/prisma/schema.prisma`

PostgreSQL 16 với extension `pgvector`. 6 enums + 17 models (thêm `TaskNote`, `AIAuditLog`).

**Enums:**

| Enum | Values |
|------|--------|
| `Role` | TRUONG_PHONG, PHO_TP, TRUONG_BO_PHAN, CHUYEN_VIEN, NHAN_VIEN |
| `Department` | BAN_LANH_DAO, TAI_CHINH_KE_HOACH, NONG_NGHIEP_MOI_TRUONG, XAY_DUNG_CONG_THUONG |
| `TaskStatus` | PENDING, IN_PROGRESS, **AWAITING_REVIEW** (mới), COMPLETED, OVERDUE, CANCELLED |
| `Priority` | KHAN_CAP, CAO, THUONG, THAP |
| `TaskSource` | INTERNAL, UBND_DIRECTIVE, IHANOI |
| `TTHCStatus` | RECEIVED, PROCESSING, COMPLETED, RETURNED |
| `DocType` | NGHI_DINH, THONG_TU, QUYET_DINH, LUAT, NGHI_QUYET, CONG_VAN |

### `app/prisma/seed.ts`

Seed script:
- **2 TaskGroups:** Tổ 1 (địa bàn HVT + Hữu Văn + Tân Tiến) và Tổ 2 (địa bàn Mỹ Lương + Trần Phú + Đồng Tâm)
- **21 Users** từ Quyết định phân công. Dùng `upsert` — idempotent. Mật khẩu: `ChangeMe@2026` (scrypt, rounds=12). Tạo kèm Better Auth `Account` record (`providerId="credential"`).

---

## 9. Prisma Models Chi Tiết

### Nhóm Auth

**`User`** (`users`)
- Core: `id` (cuid), `email` (unique), `name`, `passwordHash`
- RBAC: `role` (Role), `department` (Department), `position`
- Multi-dept: **`managedDepartments Department[]`** — TRUONG_BO_PHAN có thể quản nhiều bộ phận. Null/empty = chỉ dept chính. VD: Đinh Xuân Hội phụ trách NONG_NGHIEP_MOI_TRUONG + XAY_DUNG_CONG_THUONG
- Phân công: `fields[]`, `areas[]`, `teamGroupCode` ("to-1"/"to-2"), `isTeamLeader`, `responsibilities`
- Trạng thái: `isActive`, `phone`

**`Session`**, **`Account`**, **`Verification`** — Better Auth managed.

### Nhóm Task Management

**`TaskGroup`** (`task_groups`) — Tổ 1 và Tổ 2.

**`Task`** (`tasks`)
- Quan hệ: `assigneeId` HOẶC `taskGroupId`, `creatorId`
- **Workflow confirmation fields (mới):** `submittedAt` (khi assignee gửi AWAITING_REVIEW), `confirmedById` (FK → User), `confirmedAt` (khi TP/PTP confirm)
- Sub-tasks: `parentTaskId` (self-referential)
- Nguồn: `sourceType` + `sourceId` (link tới UBNDDirective/IHanoiComplaint)
- Pháp lý: `legalReferences[]`
- Soft delete: `deletedAt`

**`ProgressReport`** (`progress_reports`) — `percentComplete` (0-100), `weekNumber`, `monthNumber`, `year`.

**`TaskNote`** (`task_notes`) — (mới)
- `taskId`, `authorId`, `content` (Text)
- Snapshot fields (immutable): `authorName`, `authorPosition`, `authorRole` — ghi lại lúc tạo note, không thay đổi dù user đổi chức vụ sau
- `isPinned` (Boolean, default false) — chỉ TP ghim
- Indexes: `(taskId, createdAt)`, `(authorId)`

### Nhóm UBND & Lịch

**`UBNDDirective`** (`ubnd_directives`) — chỉ đạo UBND, `phongResponse`, soft delete.

**`WorkSchedule`** (`work_schedules`) — lịch cá nhân, indexes `(year, weekNumber)` và `(year, monthNumber)`.

### Nhóm iHanoi & TTHC

**`IHanoiComplaint`** (`ihanoi_complaints`) — `ticketCode` (unique), citizen info, `resolution`.

**`TTHCRecord`** (`tthc_records`) — `procedureCode`, `TTHCStatus`, phân công theo `area`.

### Nhóm AI Legal (RAG)

**`LegalDocument`** (`legal_documents`)
- Metadata: `docType`, `docNumber` (unique với docType), `issuedDate`, `effectiveDate`
- Trạng thái: `status` (`"active"` / `"superseded"` / `"expired"`), `supersededBy`
- Upload: `filePath`, `uploadedById`, `summary`

**`LegalChunk`** (`legal_chunks`)
- Cấu trúc: `article` ("Điều 5"), `section` ("Khoản 2"), `point` ("Điểm a"), `content`
- **Field `embedding vector(768)`** được thêm qua raw SQL migration (`scripts/add-embedding-column.ts`) — Prisma schema comment chỉ ghi `// embedding vector(384)` (outdated comment, thực tế là 768 dim)
- IVFFlat index tạo tự động khi >= 100 non-null embedding rows
- Cascade delete khi xóa LegalDocument

**`Conversation`** (`conversations`)
- `title`: auto-sinh từ câu hỏi đầu (truncate 80 chars)
- `isPinned`: ghim conversation → không bị auto-delete
- Index `(userId, updatedAt)` cho sort theo newest

**`ChatHistory`** (`chat_histories`)
- `question`, `answer`, `sources` (JSON: `{ _provider, refs: [{ documentId, article, section }] }`)
- `_provider` trong `sources` chỉ accessible server-side — không expose qua API
- `isSaved` (bookmark), `rating` (1-5)

### Nhóm Notifications

**`Notification`** (`notifications`)
- `type`: `"TASK_ASSIGNED"` / `"TASK_OVERDUE"` / `"TASK_NOTE"` / `"REPORT_DUE"` / `"UBND_NEW"` / `"RISK_OVERDUE"` / `"RISK_DEADLINE_SOON"` / `"RISK_STALE_PENDING"` / `"RISK_UBND_DEADLINE"` / `"RISK_OVERLOAD"` / `"RISK_NO_REPORT"` / `"RISK_AWAITING_REVIEW"`
- `isRead`, `readAt`, `link` (deep link)
- Compound index `(userId, isRead)` cho count unread nhanh

### Nhóm AI Agent

**`AIAuditLog`** (`ai_audit_logs`) — (mới)
- `userId`, `action` (vd: `"tool:createTask"`, `"tool:getTaskStats"`), `tool` (tool name)
- `input` (JSON — arguments), `output` (JSON — sanitized result)
- `success` (Boolean), `errorMsg`, `duration` (ms)
- Ghi cho mọi tool call (cả read và write) và mọi confirmed action
- Indexes: `(userId, createdAt)`, `(action, createdAt)`

---

## 10. AI Tools Stack

### Kiến trúc

```
lib/ai-tools/agent.ts          ← Agent loop (parse → dispatch → stream)
lib/ai-tools/registry.ts       ← Map toolName → ToolDefinition
lib/ai-tools/types.ts          ← ToolDefinition, ToolContext, DryRunResult
lib/ai-tools/system-prompt.ts  ← buildAgentSystemPrompt(user) role-aware
lib/ai-tools/tools/
  task-tools.ts     ← getTaskStats, getOverdueTasks, getMyTasks, getUserWorkload
  ubnd-tools.ts     ← getUBNDDirectives
  legal-tools.ts    ← searchLegalDocs
  write-tools.ts    ← createTask, updateTaskStatus, addProgressReport,
                       createReminder, addTaskNote
```

### ToolDefinition type

```typescript
type ToolDefinition = {
  name: string;
  description: string;
  parameters: JSONSchema;   // Zod schema → JSON schema cho LLM function calling
  requiresRole?: Role[];    // Nếu set, từ chối role không có trong list
  execute: (args, ctx: ToolContext) => Promise<ToolResult>;
};

type ToolContext = {
  userId: string;
  role: Role;
  department: Department;
  managedDepartments: Department[];
  confirmed?: boolean;  // true khi gọi từ /api/ai/confirm-action
};
```

### Dry-run pattern (write tools)

```typescript
// Trong execute() của write tool:
if (!ctx.confirmed) {
  // DRY RUN: validasi sơ bộ, trả preview
  return {
    __pendingAction: {
      toolName: "createTask",
      input: validatedArgs,
      preview: "Tạo nhiệm vụ: 'Kiểm tra xây dựng phường Mỹ Lương' cho Nguyễn Danh Hùng, deadline 15/05/2026"
    }
  };
}
// Thực thi thật khi confirmed=true
const result = await db.task.create(...);
await db.aIAuditLog.create({ action: "tool:createTask", ... });
return { success: true, taskId: result.id };
```

### Risk types (scanner.ts)

| Constant | Điều kiện trigger | Notify |
|----------|-------------------|--------|
| `RISK_OVERDUE` | Task quá deadline, chưa COMPLETED/CANCELLED | assignee + leader |
| `RISK_DEADLINE_SOON` | Deadline trong 24h, chưa COMPLETED | assignee |
| `RISK_STALE_PENDING` | PENDING > 3 ngày kể từ tạo | assignee + TBP |
| `RISK_UBND_DEADLINE` | UBND directive deadline trong 48h | assigneeId + TP/PTP |
| `RISK_OVERLOAD` | Cán bộ có > 5 task active (PENDING+IN_PROGRESS) | TBP + TP |
| `RISK_NO_REPORT` | IN_PROGRESS > 3 ngày không có progress report | assignee + creator |
| `RISK_AWAITING_REVIEW` | AWAITING_REVIEW > 1 ngày chưa confirm | TP/PTP |
