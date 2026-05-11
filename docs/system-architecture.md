# System Architecture

**Dự án:** App Quản Lý Phòng Kinh Tế Xã Trần Phú
**Cập nhật:** 2026-05-11

---

## Mục lục

1. [Layered Architecture Overview](#1-layered-architecture-overview)
2. [Request Flow Chuẩn](#2-request-flow-chuẩn)
3. [AI Agent Flow — Tool Calling + RAG Fallback](#3-ai-agent-flow--tool-calling--rag-fallback)
4. [Confirmation Flow — Write Tool Dry-Run](#4-confirmation-flow--write-tool-dry-run)
5. [RAG Pipeline Chi Tiết](#5-rag-pipeline-chi-tiết)
6. [Background Risk Scanner — Cron Architecture](#6-background-risk-scanner--cron-architecture)
7. [Auth Flow](#7-auth-flow)
8. [RBAC Enforcement — 3 Tầng với Scope Filter](#8-rbac-enforcement--3-tầng-với-scope-filter)
9. [Task Workflow State Machine](#9-task-workflow-state-machine)
10. [AI Provider Abstraction Layer](#10-ai-provider-abstraction-layer)
11. [PDF OCR Pipeline](#11-pdf-ocr-pipeline)
12. [Data Flow — Task → Notification](#12-data-flow--task--notification)
13. [Deployment Topology](#13-deployment-topology)
14. [Environment Variables](#14-environment-variables)
15. [Security Considerations](#15-security-considerations)

---

## 1. Layered Architecture Overview

```
+------------------------------------------------------------------+
|                        BROWSER / PWA                            |
|  (Android Chrome, iOS Safari — cài như app qua Add to Home)     |
+------------------------------------------------------------------+
                              |
                         HTTPS (443)
                              |
+------------------------------------------------------------------+
|                      NGINX (Reverse Proxy)                       |
|  - SSL Termination (Let's Encrypt)                               |
|  - Gzip compression                                              |
|  - Security headers (HSTS, X-Frame-Options, CSP)                |
|  - Rate limiting (limit_req_zone cho /api/)                      |
+------------------------------------------------------------------+
                              |
                       HTTP (internal)
                              |
+------------------------------------------------------------------+
|                    NEXT.JS APP SERVER (port 3000)                |
|                                                                  |
|  +--------------------+  +-------------------------------------+ |
|  |  Middleware         |  |  App Router (RSC + Server Actions)  | |
|  |  - Session check    |  |  - Server Components (default)      | |
|  |  - Route protection |  |  - Client Components ("use client") | |
|  |  - Redirect /login  |  |  - Server Actions ("use server")    | |
|  +--------------------+  +-------------------------------------+ |
|                                                                  |
|  +--------------------+  +-------------------------------------+ |
|  |  API Routes         |  |  lib/ (Agent + RAG + AI stack)     | |
|  |  - /api/auth/[all]  |  |  - ai-tools/ (agent, registry,     | |
|  |  - /api/ai/chat     |  |    types, system-prompt, tools/*)  | |
|  |  - /api/ai/status   |  |  - ai-monitor/scanner.ts (risk)    | |
|  |  - /api/ai/confirm  |  |  - embeddings.ts (Gemini embed)    | |
|  |  - /api/cron/risk   |  |  - rag-hybrid.ts (vector+BM25)     | |
|  |  - /api/health      |  |  - rag-article-expansion.ts        | |
|  +--------------------+  |  - rag-conversation.ts             | |
|                           |  - rag.ts (legacy fallback)         | |
|                           |  - ai.ts (multi-provider)           | |
|                           |  - api-key-rotator.ts              | |
|                           |  - pdf-batch-ocr.ts (parallel)     | |
|                           +-------------------------------------+ |
+------------------------------------------------------------------+
                              |
                         Prisma ORM
                              |
+------------------------------------------------------------------+
|                   POSTGRESQL 16 + pgvector                       |
|  - 17 models, 6 enums (+ TaskNote, AIAuditLog)                  |
|  - TaskStatus.AWAITING_REVIEW (mới)                              |
|  - legal_chunks.embedding vector(768) — IVFFlat index           |
|  - Docker volume: postgres_data                                  |
+------------------------------------------------------------------+

+---------------------+
|   EXTERNAL CRON     |
|  (cron-job.org /    |
|   Vercel / server)  |
|  Every 30 min:      |
|  GET /api/cron/risk |
+---------------------+

+------------------+    +------------------+    +------------------+
| ANTHROPIC API    |    | GOOGLE GEMINI    |    | DEEPSEEK API     |
| claude-sonnet-4-5|    | gemini-2.5-flash |    | deepseek-chat    |
| (fallback ưu 3)  |    | (ưu tiên 1)      |    | (ưu tiên 2)      |
+------------------+    +------------------+    +------------------+
          ^                      ^                      ^
          |                      |
          +------ lib/ai.ts -----+------+  lib/embeddings.ts
                (chat/streaming)         (gemini-embedding-001, 768d)
```

---

## 2. Request Flow Chuẩn

```
Browser request
      |
      v
[1] NGINX
    - TLS termination
    - Proxy_pass http://nextjs:3000
      |
      v
[2] Next.js Middleware (app/middleware.ts)
    - Đọc session cookie (prefix "pkt")
    - Gọi auth.api.getSession()
    - Nếu chưa login → redirect /login
    - Nếu user.isActive = false → redirect /login?error=inactive
      |
      v
[3] Server Component (vd: app/(dashboard)/tasks/page.tsx)
    - requireAuth() → lấy user từ DB
    - requireRole() / requirePermission() nếu page cần cụ thể
    - Gọi Server Action hoặc trực tiếp query db
      |
      v
[4] Server Action (vd: actions/task.ts: getTasks())
    - requireAuth() lần 2 (defense in depth)
    - hasPermission(user.role, "task:view:all") kiểm tra quyền
    - buildScopeFilter(user) → Prisma where clause
    - db.task.findMany({ where, include, take: 200 })
      |
      v
[5] Prisma ORM → PostgreSQL → rows
      |
      v
[6] React Server Component render HTML → stream về browser
      |
      v
[7] Browser: SSR HTML + React hydration cho Client Components
```

---

## 3. AI Agent Flow — Tool Calling + RAG Fallback

```
[1] User nhập câu hỏi
    "Hiện có bao nhiêu task quá hạn?"  ← phù hợp tool
    "Quy định về cấp phép xây dựng?"   ← phù hợp RAG
      |
      v
[2] ChatInterface (Client Component — "use client")
    - POST /api/ai/chat
    - Body: { question: "...", conversationId: "..." }
      |
      v
[3] /api/ai/chat/route.ts (Server)
    - requireAuth() → canUseAI(user.role)
    - Tạo ToolContext: { userId, role, department, managedDepartments }
      |
      v
[4] Agent loop (lib/ai-tools/agent.ts):
    - buildAgentSystemPrompt(user) — role-aware context
    - LLM function calling: gửi câu hỏi + danh sách tools
    - LLM trả: tool_call hoặc text thường
      |
      +── Tool match ──────────────────────────────────────────+
      |  [4a] registry.get(toolName) → ToolDefinition          |
      |  [4b] requiresRole check (vd: getUserWorkload chỉ TP+) |
      |  [4c] tool.execute(args, ctx)                          |
      |       → READ tool: trả data trực tiếp                  |
      |       → WRITE tool (ctx.confirmed = false):            |
      |         trả DryRunResult { __pendingAction }            |
      |  [4d] Format kết quả → stream về client                |
      +────────────────────────────────────────────────────────+
      |
      +── No tool / Agent fail ──────────────────────────────────+
      |  FALLBACK về Hybrid RAG pipeline:                         |
      |  [5] isFollowUpQuestion? → reuse chunks : retrieveWithArticleExpansion() |
      |      → retrieveHybrid() → retrieveRelevantChunks()        |
      +──────────────────────────────────────────────────────────+
      |
      v
[6] SSE stream events:
    data: { "conversationId": "...", "sources": [...] }    ← metadata
    data: { "text": "Hiện có 3 task quá hạn: ..." }        ← text chunks
    data: { "pendingAction": { toolName, input, preview } } ← nếu write tool
    ...
    data: [DONE]
      |
      v
[7] ChatInterface:
    - KHÔNG hiện tên model/provider
    - Nếu nhận pendingAction → render <ConfirmationCard>
    - Nếu text → hiển thị typing effect
```

---

## 4. Confirmation Flow — Write Tool Dry-Run

```
WRITE TOOL: createTask

[1] Agent gọi createTask(args, ctx={ confirmed: false })
    → DRY RUN: validate args, trả DryRunResult:
    {
      __pendingAction: {
        toolName: "createTask",
        input: { title, assigneeId, deadline, ... },  // đã validate
        preview: "Tạo nhiệm vụ 'Kiểm tra xây dựng' cho Nguyễn Danh Hùng, deadline 15/05/2026"
      }
    }
      |
      v
[2] /api/ai/chat stream event:
    data: { "pendingAction": { toolName, input, preview } }
      |
      v
[3] ChatInterface nhận pendingAction:
    - Render <ConfirmationCard preview="..." toolName="createTask" />
    - Nút "Xác nhận" và "Hủy"
      |
      +── User click "Hủy" → ConfirmationCard disappear, không action
      |
      +── User click "Xác nhận" ─────────────────────────────────+
      |   POST /api/ai/confirm-action                              |
      |   Body: { toolName: "createTask", input: {...}, confirmed: true }
      |          └── input = snapshot từ DryRunResult (đã validate)
      |                                                            |
      |   [4] /api/ai/confirm-action/route.ts:                    |
      |       - requireAuth() — re-verify user                    |
      |       - Validate input lại (defense in depth)             |
      |       - tool.execute(input, { ...ctx, confirmed: true })  |
      |       - db.task.create(...)                               |
      |       - db.aIAuditLog.create({ action: "tool:createTask" })|
      |       - Trả { success: true, taskId: "..." }              |
      |                                                            |
      |   [5] ChatInterface hiển thị: "Nhiệm vụ đã được tạo thành công!" |
      +────────────────────────────────────────────────────────────+
```

**Lý do stateless:** client gửi lại input snapshot đã validate — server không cần giữ state pending action trong memory/DB. An toàn: server luôn re-verify quyền trước khi execute.

---

## 5. RAG Pipeline Chi Tiết

### Upload văn bản pháp lý

```
Admin upload PDF/DOCX
          |
          v
actions/legal.ts: uploadLegalDocument()
          |
          v
[1] chunkLegalText(text):
    +----------------------------------+
    | Split theo "Điều X":             |
    | - Regex: /^Điều\s+\d+/m         |
    | - Điều < 1500 chars → 1 chunk    |
    | - Điều >= 1500 chars → split     |
    |   thêm theo "Khoản Y"           |
    | - Metadata: article, section,   |
    |   point, chunkIndex             |
    +----------------------------------+
          |
          v
[2] db.legalDocument.create({ chunks: { create: [...] } })
    → LegalDocument + LegalChunk records
          |
          v
[3] Auto-embed (best-effort, không block nếu fail):
    embedBatch(chunkTexts, "RETRIEVAL_DOCUMENT", concurrency=4)
    → vectors[768] per chunk
          |
          v
[4] UPDATE legal_chunks SET embedding = $1::vector WHERE id = $2
    (raw SQL vì Prisma chưa native support vector type)
          |
          v
[5] Khi totalNonNullRows >= 100:
    CREATE INDEX legal_chunks_embedding_idx
    ON legal_chunks USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 50)
```

### Query — Hybrid RAG + Article Expansion

```
User query: "Điều kiện hưởng hỗ trợ di dân tái định cư?"
          |
          v
[1] embedText(query, "RETRIEVAL_QUERY")
    → queryVec[768] (Matryoshka, normalized)
          |
          v
[2] pgvector cosine search top-30:
    SELECT c.*, (c.embedding <=> $1::vector) as cosine_distance
    FROM legal_chunks c
    JOIN legal_documents d ON ...
    WHERE d.status = 'active' AND c.embedding IS NOT NULL
    ORDER BY c.embedding <=> $1::vector
    LIMIT 30
          |
          v
[3] BM25 re-rank trên tập 30 candidates:
    tokenizeKeywords(query) → ["dieu-kien", "huong", "ho-tro", "tai-dinh-cu"]
    idf = log((N - df + 0.5) / (df + 0.5) + 1)   ← BM25 standard
    tf_norm = tf × (K1+1) / (tf + K1×(1 - B + B×docLen/avgDocLen))
    header_boost ×3 nếu keyword xuất hiện trong 200 ký tự đầu chunk
          |
          v
[4] Combine scores:
    cosineNorm = max(0, min(1, (1 - cosine_distance + 1) / 2))
    finalScore = 0.6 × cosineNorm + 0.4 × bm25Norm
    Sort DESC → top-15 candidates
          |
          v
[5] Article Expansion — Group theo (documentId, article):
    +--------------------------------+
    | Điều 5 NĐ-150/2025: 3 chunks  | score=0.87
    | Điều 12 Luật Đất đai: 1 chunk  | score=0.74
    | Điều 8 NĐ-67/2020: 2 chunks   | score=0.71
    +--------------------------------+
          |
          v
[6] Pull FULL chunks của top-3 Điều:
    db.legalChunk.findMany({
      where: { documentId, article },
      orderBy: { chunkIndex: "asc" }
    })
    → Điều 5 đầy đủ (tất cả Khoản)
    → Điều 12 đầy đủ
    → Điều 8 đầy đủ
    (cap: 25 chunks/Điều, 20000 chars tổng)
          |
          v
[7] buildArticleGroupedMessage(query, articles):
    VĂN BẢN PHÁP LUẬT THAM KHẢO:
    [Nguồn 1] Nghị định 150/2025/NĐ-CP - Điều 5:
    Khoản 1. Đối tượng được hỗ trợ...
    Khoản 2. Điều kiện hưởng...
    ...
    ---
    [Nguồn 2] Luật Đất đai 2024 - Điều 12: ...
    ---
    CÂU HỎI: Điều kiện hưởng hỗ trợ di dân tái định cư?
          |
          v
[8] streamChat(messages, maxTokens=6000)
    → AI trả lời đầy đủ, trích dẫn inline: "[150/2025/NĐ-CP, Điều 5, Khoản 2]"
```

### Follow-up Question Flow

```
History:
  Q1: "Điều kiện hưởng hỗ trợ di dân tái định cư?"
  A1: "Theo NĐ 150/2025, Điều 5, có 3 điều kiện: ..."
          |
          v
Q2: "Tóm tắt ngắn gọn" (follow-up)
isFollowUpQuestion("Tóm tắt ngắn gọn", hasHistory=true)
  → Regex match: /tóm\s*tắt/i → TRUE
          |
          v
KHÔNG retrieve lại
getChunksFromPreviousSources(A1.sources)
  → Pull lại Điều 5 từ NĐ-150/2025 (đã biết)
          |
          v
buildRAGUserMessage("Tóm tắt ngắn gọn", reusedChunks)
buildChatMessages([Q1, A1], currentUserMessage)
  → Multi-turn: [user: Q1, assistant: A1, user: "Tóm tắt ngắn gọn"]
          |
          v
AI hiểu context từ lịch sử, trả lời ngắn gọn về Điều 5 NĐ-150/2025
```

---

## 6. Background Risk Scanner — Cron Architecture

```
EXTERNAL CRON (mỗi 30 phút — cron-job.org hoặc server cron)
          |
          | GET /api/cron/risk-scan?secret=CRON_SECRET
          v
[1] /api/cron/risk-scan/route.ts:
    - Xác thực: req.query.secret === process.env.CRON_SECRET
    - Sai → 401 Unauthorized
    - Đúng → tiếp tục
          |
          v
[2] markOverdueTasks() — Auto-mark trước khi scan:
    UPDATE tasks SET status = 'OVERDUE'
    WHERE deadline < now() AND status IN ('PENDING', 'IN_PROGRESS')
          |
          v
[3] runRiskScan() — lib/ai-monitor/scanner.ts:
    Scan 7 loại rủi ro song song (Promise.all):

    [3a] RISK_OVERDUE:
         Tasks với status=OVERDUE + assigneeId != null
         → Notify: assignee + TP/PTP

    [3b] RISK_DEADLINE_SOON:
         Tasks với deadline trong 24h, chưa COMPLETED
         → Notify: assignee

    [3c] RISK_STALE_PENDING:
         Tasks PENDING > 3 ngày (createdAt + 3days < now)
         → Notify: assignee + creator (TBP)

    [3d] RISK_UBND_DEADLINE:
         UBNDDirective với deadline trong 48h, chưa complete
         → Notify: assigneeId + TP/PTP

    [3e] RISK_OVERLOAD:
         Users với count(PENDING+IN_PROGRESS tasks) > 5
         → Notify: user đó + TBP/TP của họ

    [3f] RISK_NO_REPORT:
         Tasks IN_PROGRESS > 3 ngày, không có progress report gần đây
         → Notify: assignee + creator

    [3g] RISK_AWAITING_REVIEW:
         Tasks AWAITING_REVIEW > 1 ngày
         → Notify: TP/PTP
          |
          v
[4] Dedup mỗi loại risk:
    findFirst({ userId, type, link, createdAt > now - 24h })
    → Đã có trong 24h → SKIP (không spam)
    → Chưa có → create notification
          |
          v
[5] Ghi AIAuditLog cho mỗi scan:
    { action: "digest:riskScan", input: { types }, output: { notifications } }
          |
          v
[6] Return { scanned: 7, notifications: N, duration: Xms }
```

**Notes:**
- Cron trigger ngoài: external HTTP GET (không dùng `node-cron` trong-process — tránh memory leak + không hoạt động khi scale horizontal)
- `CRON_SECRET` khác `BETTER_AUTH_SECRET` — rotate độc lập
- Setup chi tiết: xem [`app/docs/ai-monitor-cron.md`](../app/docs/ai-monitor-cron.md)

---

## 7. Auth Flow

```
ĐĂNG NHẬP:

[1] User nhập email + password trên /login
[2] LoginForm.tsx (Client) → authClient.signIn.email({ email, password })
[3] POST /api/auth/sign-in/email (Better Auth handler)
[4] Better Auth:
    - Tìm Account theo email
    - Verify password: scrypt.verify(password, hash)
    - Tạo Session record (token UUID, expiresAt = now + 7 days)
    - Set cookie: pkt.session_token (HttpOnly, Secure, SameSite=Lax)
[5] Redirect về / (dashboard)

SESSION VALIDATION (mỗi request):
[1] Browser gửi cookie pkt.session_token
[2] Next.js Middleware: auth.api.getSession({ headers })
    → Lookup session token trong DB → validate expiresAt
[3] Session hợp lệ → tiếp tục; không hợp lệ → redirect /login

ĐĂNG XUẤT:
authClient.signOut() → DELETE session → clear cookie → redirect /login
```

---

## 8. RBAC Enforcement — 3 Tầng với Scope Filter

```
REQUEST: GET /users (chỉ TRUONG_PHONG được truy cập)
          |
          v
+-------------------------------+
| TẦNG 1: Middleware             |
| app/middleware.ts              |
| - Kiểm tra: có session không?  |
| - Không → redirect /login     |
| - isActive=false → redirect   |
+-------------------------------+
          |
          v
+-------------------------------+
| TẦNG 2: Page Level             |
| app/(dashboard)/users/page.tsx |
| requirePermission("user:manage")|
| → hasPermission(role, perm)   |
| → Sai role → redirect /       |
+-------------------------------+
          |
          v
+-------------------------------+
| TẦNG 3: Server Action          |
| (actions/ files)               |
| requireAuth() + hasPermission  |
| → Sai → return { error: "..." }|
| → Đúng → thực hiện DB op      |
+-------------------------------+
```

**Tại sao cần 3 tầng?**
- Tầng 1: Chặn unauthenticated user khỏi toàn bộ dashboard
- Tầng 2: UX — redirect sớm, tránh flash nội dung
- Tầng 3: Defense in depth — Server Actions có thể bị gọi trực tiếp bỏ qua UI

**Scope filter tại mỗi tầng:**
- `isTopLeader(role)` → không filter (thấy tất cả)
- `isDeptManager(role)` → filter theo `getManagedDepartments(user)` (hỗ trợ multi-dept)
- `isStaff(role)` → filter theo `assigneeId = user.id` hoặc `teamGroupCode`
- **KHÔNG dùng `isLeader()` cũ** — deprecated vì không phân biệt TBP với TP/PTP

**AI Tools scope filter:**
- Tool `requiresRole?: Role[]` → agent reject ngay nếu user không có role
- `ToolContext.managedDepartments` — TBP tools dùng để giới hạn query scope
- NHAN_VIEN scope-restricted: AI từ chối khi hỏi về người khác (system prompt + tool filter)

---

## 9. Task Workflow State Machine

```
                    [Tạo task]
                        |
                        v
                   ┌─────────┐
                   │ PENDING │
                   └────┬────┘
                        │ assignee: "Bắt đầu"
                        v
                 ┌─────────────┐
                 │ IN_PROGRESS │◄─────────────┐
                 └──────┬──────┘              │
                        │ assignee:           │ TP/PTP: "Yêu cầu làm lại"
                        │ "Gửi hoàn thành"   │
                        v                     │
              ┌──────────────────┐            │
              │ AWAITING_REVIEW  │────────────┘
              └────────┬─────────┘
                       │ TP/PTP: "Xác nhận"
                       v
                 ┌───────────┐
                 │ COMPLETED │ (terminal)
                 └───────────┘

     (Từ bất kỳ trạng thái nào) ─ cancel → CANCELLED (terminal)
     (System auto) ─ deadline pass + PENDING/IN_PROGRESS → OVERDUE
```

**Actions và người thực hiện:**
| Action | Từ trạng thái | Sang trạng thái | Ai thực hiện |
|--------|--------------|-----------------|--------------|
| start | PENDING | IN_PROGRESS | Assignee |
| submit | IN_PROGRESS | AWAITING_REVIEW | Assignee |
| confirm | AWAITING_REVIEW | COMPLETED | TP / PTP |
| reject | AWAITING_REVIEW | IN_PROGRESS | TP / PTP |
| cancel | bất kỳ | CANCELLED | Creator / TP |

---

## 10. AI Provider Abstraction Layer

```
            User gửi câu hỏi
                  |
                  v
         /api/ai/chat (Server)
                  |
                  v
    +------------------------+
    |   getActiveProvider()  |
    |  1. AI_PROVIDER env?   |
    |     Có + available → dùng |
    |  2. Gemini available?  |
    |     → "gemini"         |
    |  3. DeepSeek available?|
    |     → "deepseek"       |
    |  4. Anthropic available?|
    |     → "anthropic"      |
    |  5. Không có → null    |
    +------------------------+
                  |
                  v
    +------------------------+
    |    APIKeyRotator       |
    |  Round-robin giữa      |
    |  nhiều key per provider|
    |  Cooldown thông minh:  |
    |  429 → 5 min           |
    |  401 → 24h             |
    |  5xx → 30s             |
    +------------------------+
                  |
                  v
    +------------------------+
    |     streamChat(opts)   |
    |  messages[] (multi-turn)|
    |  maxTokens = 6000      |
    +------------------------+
                  |
      +-----------+-----------+
      |           |           |
      v           v           v
Google Gemini  DeepSeek   Anthropic
gemini-2.5-   deepseek-   claude-sonnet
flash         chat        4-5
```

**Thứ tự ưu tiên:**
1. `AI_PROVIDER` env (nếu set + key khả dụng)
2. Gemini — free tier hào phóng
3. DeepSeek — rẻ, OpenAI-compatible endpoint
4. Anthropic — chất lượng cao, dự phòng

---

## 11. PDF OCR Pipeline

```
User upload PDF (200+ trang)
          |
          v
[1] Fast path check:
    file < 18MB AND ≤ 15 trang → ocrSingleBuffer() → done

[2] Load PDF via pdf-lib: PDFDocument.load(buffer)
    totalPages = pdfDoc.getPageCount()
    concurrency = min(keyCount × 2, 4)
          |
          v
[3] Split PDF → BatchJob[]:
    batchCount = ceil(totalPages / 15)
    Batch 1: trang 1-15 → sub-PDF buffer
    Batch 2: trang 16-30 → sub-PDF buffer
    ...
    (split nhanh, không gọi network)
          |
          v
[4] Worker pool — chạy song song:
    Khởi động N workers (N = min(concurrency, batchCount))
    Mỗi worker lấy batch từ cursor++, gọi ocrSingleBuffer()

    +-------+  +-------+  +-------+  +-------+
    |Worker1|  |Worker2|  |Worker3|  |Worker4|
    |Batch1 |  |Batch2 |  |Batch3 |  |Batch4 |
    +-------+  +-------+  +-------+  +-------+
         |          |          |          |
         +----------+----------+----------+
                    | (auto-rotate API key per call)
                    v
              Gemini Vision OCR
          |
          v
[5] Ghép kết quả theo đúng thứ tự index:
    === Trang 1-15 ===\n[text]
    === Trang 16-30 ===\n[text]
    ...
          |
          v
[6] Return BatchOCRResult:
    { text, totalPages, batchCount, textLength, failedBatches, durationMs, concurrency }

Kết quả: PDF 200 trang (~5 phút sequential) → ~1-1.5 phút (4 batch song song)
```

---

## 12. Data Flow — Task → Notification

```
TRUONG_PHONG giao việc cho CHUYEN_VIEN:

[1] TRUONG_PHONG: Submit NewTaskDialog
[2] Client → createTask(input) [Server Action]
[3] Server Action:
    - requireAuth() → user = TRUONG_PHONG
    - hasPermission(role, "task:create") → OK
    - taskCreateSchema.parse(input) → validated data
    - db.task.create({ creatorId: user.id, assigneeId: cv.id })
[4] db.notification.create({
      userId: cv.id, type: "TASK_ASSIGNED",
      title: "Bạn có nhiệm vụ mới",
      message: "Vũ Văn Tuấn đã giao: '...'",
      link: "/tasks/{taskId}"
    })
[5] revalidatePath("/tasks"), revalidatePath("/")
[6] CHUYEN_VIEN nhận badge unread notification trên header

NHÓM Tổ 1 được giao việc:
[1] createTask({ taskGroupId: "to-1-id" })
[2] db.user.findMany({ where: { teamGroupCode: "to-1", isActive: true } })
[3] db.notification.createMany({ data: members.map(m => ...) })
    → Tất cả thành viên Tổ 1 nhận notification
```

---

## 13. Deployment Topology

### Production Stack

```
Internet
    |
    | HTTPS 443
    v
+------------------+
|   VPS / Server   |  (Primary — VPS Cloud hoặc server vật lý UBND)
|                  |
|  Docker Compose: |
|  +------------+  |
|  | nginx      |  |  ← Port 80/443, SSL termination, reverse proxy
|  +------------+  |
|  | nextjs     |  |  ← Port 3000 (internal), App server
|  +------------+  |
|  | postgres   |  |  ← Port 5432 (internal only), pgvector:pg16
|  +------------+  |
|  | backup     |  |  ← Cron: pg_dump mỗi ngày 2:00 AM
|  +------------+  |
|                  |
|  Volumes:        |
|  postgres_data   |  ← Database files
|  uploads         |  ← File uploads (văn bản pháp lý PDFs)
|  backups         |  ← SQL dumps (30 ngày retention)
|  ssl_certs       |  ← Let's Encrypt certs
+------------------+
         |
         | Replication / Manual sync
         v
+------------------+
|  Server UBND nội |  (Backup — data sovereignty)
|  Same stack      |
+------------------+
```

### Network Security

```
External:
  Internet → nginx (80, 443) → OK
  Internet → postgres (5432) → BLOCKED
  Internet → nextjs (3000) → BLOCKED

Internal Docker network:
  nginx → nextjs:3000 → OK
  nextjs → postgres:5432 → OK
  backup → postgres:5432 → OK (pg_dump)
```

---

## 14. Environment Variables

### Required (production)

```bash
# Database
DATABASE_URL=postgresql://USER:PASS@postgres:5432/phong_kinh_te

# Better Auth
BETTER_AUTH_SECRET=random-256-bit-secret   # openssl rand -base64 32
BETTER_AUTH_URL=https://your-domain.vn
NEXT_PUBLIC_APP_URL=https://your-domain.vn

# AI Providers — chat (ít nhất 1)
GEMINI_API_KEY=...         # Google AI Studio — ưu tiên 1
GEMINI_API_KEYS=key1,key2  # Nhiều keys: round-robin, phân cách bằng dấu phẩy
DEEPSEEK_API_KEY=...       # platform.deepseek.com — ưu tiên 2
ANTHROPIC_API_KEY=...      # console.anthropic.com — ưu tiên 3

# AI Provider override (optional)
AI_PROVIDER=gemini         # Force dùng provider cụ thể

# Background risk scanner cron
CRON_SECRET=random-secret  # openssl rand -hex 32 — bắt buộc nếu dùng risk scanner

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@phongkinhte-tranphu.vn
SMTP_PASS=app-specific-password
```

**Lưu ý về AI keys:**
- Cùng Gemini keys được dùng cho cả **chat** (`lib/ai.ts`) và **embedding** (`lib/embeddings.ts`)
- Nhiều keys cho 1 provider → round-robin tự động qua `APIKeyRotator`
- `GEMINI_API_KEYS` (nhiều keys) sẽ được merge với `GEMINI_API_KEY` (1 key)

### Development

```bash
# .env.local (không commit)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/phong_kinh_te_dev
BETTER_AUTH_SECRET=dev-secret-not-for-production
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
GEMINI_API_KEY=...  # Cần để test embedding + chat
```

### Critical: Không commit vào git

`.env`, `.env.local`, `.env.production` phải có trong `.gitignore`. Chỉ commit `.env.example`.

---

## 15. Security Considerations

### Transport Security

```
- HTTPS bắt buộc (Let's Encrypt, auto-renew)
- HSTS: Strict-Transport-Security: max-age=31536000
- Nginx: ssl_protocols TLSv1.2 TLSv1.3
- Target: A+ trên ssllabs.com
```

### Authentication Security

```
- scrypt password hashing (Better Auth default)
- Session cookie: HttpOnly, Secure, SameSite=Lax
- Cookie prefix "pkt" — namespace isolation
- Session TTL: 7 ngày
- Inactive users blocked tại middleware (isActive=false)
```

### API Security

```
- No CORS wildcard — trustedOrigins danh sách cụ thể
- Rate limiting tại nginx: limit_req_zone cho /api/
- Input validation Zod tại tất cả entry points
- Soft delete — không mất dữ liệu
```

### AI Provider Security

```
- API keys CHỈ trong server env vars (process.env)
- Provider name/model ẩn hoàn toàn khỏi client
- /api/ai/chat: server tự chọn provider — client không chỉ định được
- /api/ai/status: chỉ trả { available: boolean }
- Error sanitization: loại bỏ vendor-specific errors
  - "invalid key" → "Lỗi xác thực dịch vụ AI"
  - "rate limit" → "Đã đạt giới hạn sử dụng AI"
  - SDK names, URLs → ẩn
- sources.{_provider} chỉ lưu server-side (JSON field), không expose qua API
```

### Data Sovereignty

```
- Dữ liệu xã Trần Phú chỉ lưu trên VPS/server nội bộ
- Không cloud DB (không Supabase, PlanetScale)
- File uploads: local filesystem (Docker volume), không S3
- PostgreSQL không expose port ra internet
- Backup: local disk hoặc NAS nội bộ
```

### Nginx Security Headers

```nginx
add_header X-Frame-Options SAMEORIGIN;
add_header X-Content-Type-Options nosniff;
add_header X-XSS-Protection "1; mode=block";
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains";
add_header Referrer-Policy "strict-origin-when-cross-origin";
server_tokens off;  # Ẩn nginx version
```
