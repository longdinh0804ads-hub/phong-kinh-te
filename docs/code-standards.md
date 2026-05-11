# Code Standards

**Dự án:** App Quản Lý Phòng Kinh Tế Xã Trần Phú
**Cập nhật:** 2026-05-11

---

## Mục lục

1. [TypeScript](#1-typescript)
2. [File & Directory Naming](#2-file--directory-naming)
3. [Server vs Client Components](#3-server-vs-client-components)
4. [Server Actions Pattern](#4-server-actions-pattern)
5. [RBAC Pattern](#5-rbac-pattern)
6. [Error Handling](#6-error-handling)
7. [Date & Time Handling](#7-date--time-handling)
8. [AI Security Rules](#8-ai-security-rules)
9. [RAG Coding Patterns](#9-rag-coding-patterns)
10. [CSS & Mobile-First](#10-css--mobile-first)
11. [Import Order](#11-import-order)
12. [Vietnamese-First Convention](#12-vietnamese-first-convention)
13. [Database Patterns](#13-database-patterns)
14. [Testing Expectations](#14-testing-expectations)
15. [AI Tool Definition Pattern](#15-ai-tool-definition-pattern)
16. [Task State Machine Pattern](#16-task-state-machine-pattern)
17. [Snapshot Pattern](#17-snapshot-pattern)
18. [Notification Convention](#18-notification-convention)

---

## 1. TypeScript

### Strict Mode

`tsconfig.json` bật `strict: true`. Toàn bộ code phải pass TypeScript strict mode.

```typescript
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true
  }
}
```

### Types vs Interfaces

Ưu tiên `type` cho data shapes, `interface` chỉ khi cần extension/merging:

```typescript
// GOOD: type cho data shapes
type TaskFilters = {
  status?: string;
  priority?: string;
  assigneeId?: string;
};

// OK: interface khi cần extend
interface ComponentProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "ghost";
}
```

### No `any`

Không dùng `any` trừ khi adapter/lib bên thứ ba yêu cầu. Dùng `unknown` + type narrowing thay thế:

```typescript
// BAD
function handleError(e: any) { ... }

// GOOD
function handleError(e: unknown) {
  const message = e instanceof Error ? e.message : "Lỗi không xác định";
}

// Exception: Prisma raw queries, OpenAI-compatible messages, JSON sources
const messages: any[] = []; // OK — DeepSeek API compat
sources: { _provider: provider, refs: sources } as any  // OK — Prisma JSON
```

### Inferred Types từ Zod

Dùng `z.infer<typeof schema>` thay vì viết type riêng:

```typescript
export const taskCreateSchema = z.object({
  title: z.string().min(1),
  deadline: z.coerce.date(),
  priority: z.enum(["KHAN_CAP", "CAO", "THUONG", "THAP"]).default("THUONG"),
});

export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
```

### Prisma Types

Import types trực tiếp từ `@prisma/client`:

```typescript
import type { Role, Department, TaskStatus, DocType } from "@prisma/client";
```

---

## 2. File & Directory Naming

| Loại | Convention | Ví dụ |
|------|-----------|-------|
| Files | kebab-case | `rag-hybrid.ts`, `pdf-batch-ocr.ts` |
| React components | PascalCase export | `export function ChatInterface(...)` |
| Utility functions | camelCase | `embedText()`, `isFollowUpQuestion()` |
| Server Actions | camelCase | `createTask()`, `uploadLegalDocument()` |
| Prisma models | PascalCase | `Task`, `LegalChunk`, `ChatHistory` |
| Next.js route dirs | kebab-case | `(dashboard)/ai/`, `api/ai/chat/` |
| Environment vars | SCREAMING_SNAKE_CASE | `GEMINI_API_KEYS`, `BETTER_AUTH_SECRET` |
| Constants | SCREAMING_SNAKE_CASE | `BATCH_SIZE`, `MAX_CONCURRENCY`, `EMBEDDING_DIM` |

### Cấu trúc component file

```typescript
// 1. "use client" (nếu cần)
"use client";

// 2. Imports (xem Import Order section)
import { useState } from "react";

// 3. Types/Interfaces
type Props = { ... };

// 4. Component (named export, KHÔNG default export trừ page.tsx)
export function MyComponent({ prop }: Props) {
  return <div>...</div>;
}

// 5. Helper functions (nếu nhỏ, đặt cuối file)
function formatLabel(value: string): string { ... }
```

---

## 3. Server vs Client Components

### Mặc định: Server Component

Tất cả files trong `app/` là Server Component mặc định. Chỉ thêm `"use client"` khi cần.

```typescript
// app/(dashboard)/tasks/page.tsx — Server Component
export default async function TasksPage() {
  const user = await requireAuth();
  const tasks = await getTasks();
  return <TaskList tasks={tasks} />;
}
```

### Khi nào dùng "use client"

- `useState`, `useEffect`, `useReducer`
- `useRouter`, `useSearchParams`, `usePathname`
- Event handlers phức tạp
- Browser APIs
- Streaming SSE response (AI chat)
- AI chat interface (real-time typing effect)

### Phân tách Server/Client boundary

Đẩy `"use client"` xuống sâu nhất có thể:

```
page.tsx (Server)
├── PageHeader (Server)
├── TaskList (Server)
│   └── StatusBadge (Server)
└── NewTaskDialog (Client) — cần useState
    └── TaskForm (Client)
```

---

## 4. Server Actions Pattern

### Template chuẩn

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { hasPermission, isTopLeader, isDeptManager, getManagedDepartments } from "@/lib/permissions";
import { mySchema } from "@/lib/validations/my-module";

export async function createSomething(input: MyInput) {
  // Bước 1: requireAuth — xác thực + lấy user (bao gồm managedDepartments)
  const user = await requireAuth();

  // Bước 2: Permission check
  if (!hasPermission(user.role, "something:create")) {
    return { error: "Bạn không có quyền thực hiện thao tác này" };
  }

  // Bước 3: Scope filter (nếu cần restrict theo dept/own)
  const scopeFilter = buildScopeFilter(user);

  // Bước 4: Validate input với Zod
  const data = mySchema.parse(input);

  // Bước 5: Database operation
  const record = await db.something.create({ data: { ...data, userId: user.id } });

  // Bước 6: Invalidate cache
  revalidatePath("/something");

  return { success: true, id: record.id };
}
```

**Thứ tự bắt buộc: `requireAuth` → permission check → scope filter → Zod validation → DB write → `revalidatePath`**

### Return type convention

```typescript
type ActionResult<T = void> =
  | { error: string }
  | (T extends void ? { success: true } : { success: true } & T);

// Sử dụng trong component:
const result = await createTask(data);
if ("error" in result) {
  setError(result.error);
  return;
}
router.push(`/tasks/${result.taskId}`);
```

### Soft delete pattern

```typescript
// KHÔNG xóa thật
await db.task.update({ where: { id }, data: { deletedAt: new Date() } });

// Query luôn filter deleted
const tasks = await db.task.findMany({ where: { deletedAt: null } });
```

---

## 5. RBAC Pattern

### Ba tầng bảo vệ

```
Tầng 1 — Middleware (app/middleware.ts):
  → Redirect /login nếu không có session / isActive=false

Tầng 2 — Page level (Server Component):
  → requireAuth() — xác thực + lấy user
  → requirePermission("user:manage") — kiểm tra permission

Tầng 3 — Server Action:
  → requireAuth() + hasPermission(user.role, "task:create")
  → Không tin vào client — luôn recheck
```

### Sử dụng đúng helper

```typescript
import { requireAuth, requireRole, requirePermission } from "@/lib/session";
import {
  hasPermission, canAssignTask, isAdmin, canUseAI,
  // Helpers MỚI — dùng thay isLeader():
  isTopLeader, isDeptManager, isStaff, getManagedDepartments,
} from "@/lib/permissions";
```

**Quy tắc:** KHÔNG dùng `isLeader()` trong code mới — hàm này deprecated vì cào bằng TBP với TP/PTP gây bug scope. Dùng:
- `isTopLeader(role)` khi cần phân biệt TP/PTP (toàn quyền)
- `isDeptManager(role)` khi cần phân biệt TBP (quyền trong dept)
- `isStaff(role)` khi cần phân biệt CV/NV

### RBAC scope filter — pattern mới

```typescript
// ĐÚNG: tách rõ từng tầng scope
function buildScopeFilter(user: {
  id: string;
  role: Role;
  department: Department;
  managedDepartments: Department[];
  teamGroupCode: string | null;
}) {
  if (isTopLeader(user.role)) return {}; // TP/PTP thấy tất cả

  if (isDeptManager(user.role)) {
    const depts = getManagedDepartments(user); // hỗ trợ multi-dept
    return {
      OR: [
        { assignee: { department: { in: depts } } },
        { creatorId: user.id },
      ],
    };
  }

  // CV/NV: chỉ thấy của mình
  return {
    OR: [
      { assigneeId: user.id },
      { creatorId: user.id },
      ...(user.teamGroupCode ? [{ taskGroup: { code: user.teamGroupCode } }] : []),
    ],
  };
}

// SAI: isLeader() cào bằng TBP với TP
// if (isLeader(user.role)) return {}; // ← DEPRECATED, không dùng
```

### AI permission check

```typescript
// canUseAI: ai:full (TP..CV) HOẶC ai:limited (NV)
// NHAN_VIEN có ai:limited — vào được AI nhưng scope-restricted
// Chỉ reject nếu KHÔNG CÓ cả hai
if (!canUseAI(user.role)) return new Response("Forbidden", { status: 403 });

// Phân biệt ai:full vs ai:limited trong agent:
if (hasPermission(user.role, "ai:full")) {
  // Dùng được write tools, xem workload người khác
} else {
  // ai:limited — chỉ hỏi về việc của mình
}
```

---

## 6. Error Handling

### Server Actions — trả structured error

```typescript
// GOOD
return { error: "Không tìm thấy nhiệm vụ" };
return { error: "Bạn không có quyền thực hiện thao tác này" };

// BAD — throw crash nếu không catch ở UI
throw new Error("Not found");
```

### AI Error Sanitization

Lỗi từ AI providers phải được sanitize — không để lộ tên SDK/provider/URL:

```typescript
// app/app/api/ai/chat/route.ts
function sanitizeError(msg: string): string {
  if (/api[_-]?key|unauthorized|invalid.*key/i.test(msg))
    return "Lỗi xác thực dịch vụ AI. Vui lòng liên hệ Trưởng phòng.";
  if (/rate.*limit|quota|429/i.test(msg))
    return "Đã đạt giới hạn sử dụng AI. Vui lòng thử lại sau ít phút.";
  if (/timeout|network|fetch/i.test(msg))
    return "Lỗi kết nối tới dịch vụ AI. Vui lòng thử lại.";
  return "Đã xảy ra lỗi khi xử lý câu hỏi. Vui lòng thử lại.";
}
```

### Best-effort operations

Một số operations không được phép fail upload/main flow:

```typescript
// lib embeddings trong actions/legal.ts — best-effort, không block
if (isEmbeddingAvailable()) {
  try {
    const vecs = await embedBatch(texts, "RETRIEVAL_DOCUMENT", 4);
    // ... update embeddings
  } catch (e: any) {
    console.error("[legal-upload] Embedding failed (non-fatal):", e?.message);
    // KHÔNG throw — upload đã thành công, embedding fail là acceptable
  }
}
```

---

## 7. Date & Time Handling

### Format chuẩn Việt Nam

```typescript
import { format, formatDistance } from "date-fns";
import { vi } from "date-fns/locale";

format(date, "dd/MM/yyyy", { locale: vi });           // "09/05/2026"
format(date, "dd/MM/yyyy HH:mm", { locale: vi });     // "09/05/2026 14:30"
formatDistance(date, new Date(), { addSuffix: true, locale: vi }); // "2 ngày trước"
```

### Tuần bắt đầu thứ Hai (chuẩn VN)

```typescript
// lib/date-range.ts: computeDateRange
case "this-week": {
  const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay(); // CN = 7
  const monday = addDays(today, -(dayOfWeek - 1));
  return { from: monday, to: addDays(monday, 7), label: "Tuần này" };
}
```

### Lưu UTC, hiển thị theo locale vi

Database lưu UTC. Hiển thị dùng `date-fns` với locale `vi`. Không dùng `toLocaleDateString()`.

---

## 8. AI Security Rules

**Quy tắc bắt buộc — không được vi phạm:**

### Không expose provider info ra client

```typescript
// BAD — lộ tên provider
return Response.json({ provider: "anthropic", model: "claude-sonnet-4-5" });

// GOOD
return Response.json({ available: true });
```

### Không nhận provider từ client

```typescript
// BAD
const { question, provider } = await req.json();

// GOOD — server tự chọn
const provider = getActiveProvider();
```

### Không hiển thị provider name trong UI

```typescript
// BAD
<Badge>Powered by {providerName}</Badge>

// GOOD
<Badge>Trợ lý AI Pháp lý</Badge>
```

### Provider info chỉ trong server-side storage

```typescript
// OK — debug/billing, không expose qua API
await db.chatHistory.create({
  data: { sources: { _provider: provider, refs: sources } as any },
});
```

### Không lộ tên model trong logs public

```typescript
// OK — server logs (không accessible user)
console.log(`[chat] provider=${provider}`);

// BAD — gửi về client stream
controller.enqueue(encoder.encode(`data: ${JSON.stringify({ provider })}\n\n`));
```

---

## 9. RAG Coding Patterns

### Không sửa `lib/rag.ts`

`lib/rag.ts` là legacy BM25 fallback (tầng 3). Giữ nguyên để backward compat. Các cải tiến đều là **additive** files mới.

### File dependencies RAG stack

```
embeddings.ts
    ↑
rag-scoring.ts (BM25)
    ↑
rag-hybrid.ts (vector + BM25)
    ↑
rag-article-expansion.ts (group by Điều)
    ↑
rag-conversation.ts (multi-turn + follow-up)
    ↑
app/api/ai/chat/route.ts (orchestration)
```

### Fallback cascade pattern

```typescript
// chat/route.ts — luôn có fallback, không để RAG throw về user
let userMessage: string;
const articles = await retrieveWithArticleExpansion(question, 3);
if (articles.length > 0) {
  userMessage = buildArticleGroupedMessage(question, articles);
} else {
  let chunks = await retrieveHybrid(question, 8);
  if (chunks.length === 0) {
    chunks = await retrieveRelevantChunks(question, 5);
  }
  userMessage = buildRAGUserMessage(question, chunks);
}
```

### pgvector raw SQL

Prisma chưa support `vector` type — dùng `$queryRawUnsafe` và `$executeRawUnsafe` cho vector operations:

```typescript
// Query cosine similarity
const candidates = await db.$queryRawUnsafe<VectorRow[]>(
  `SELECT c.*, (c.embedding <=> $1::vector) as cosine_distance
   FROM legal_chunks c
   JOIN legal_documents d ON d.id = c."documentId"
   WHERE d.status = 'active' AND c.embedding IS NOT NULL
   ORDER BY c.embedding <=> $1::vector
   LIMIT 30`,
  vectorToSql(queryVec) // format: "[0.1,0.2,...]"
);

// Update embedding
await db.$executeRawUnsafe(
  `UPDATE legal_chunks SET embedding = $1::vector WHERE id = $2`,
  vectorToSql(vec),
  chunkId
);
```

### Embedding normalization

Gemini Matryoshka embedding cần re-normalize sau truncate (đã xử lý trong `embedText()`):

```typescript
// embeddings.ts — luôn normalize về unit vector
let norm = 0;
for (const v of values) norm += v * v;
norm = Math.sqrt(norm);
return norm === 0 ? values : values.map((v) => v / norm);
```

### API key rotation

Luôn dùng `APIKeyRotator.runWithRotation()` thay vì lấy key thủ công:

```typescript
// GOOD
return await rotator.runWithRotation(async (apiKey) => {
  // ... gọi API với apiKey
});

// BAD — không handle rotation khi key fail
const key = rotator.getNext();
```

### Conversation context limit

```typescript
// rag-conversation.ts — giới hạn để tránh tràn token
const HISTORY_TURNS_LIMIT = 5;
const MAX_PREV_ANSWER_CHARS = 2500;
```

Trim answer cũ trước khi push vào messages array — không gửi nguyên bản đầy đủ.

---

## 10. CSS & Mobile-First

### Touch targets tối thiểu

```tsx
<Button className="min-h-[44px]">Cập nhật tiến độ</Button>
<Link className="min-h-[44px] flex items-center px-4">Dashboard</Link>
```

### Breakpoints — mobile first

```tsx
// Mobile mặc định, desktop override
<div className="px-4 md:px-6">
<div className="hidden md:block">   {/* Ẩn mobile */}
<div className="md:hidden">         {/* Ẩn desktop */}
<div className="grid grid-cols-1 md:grid-cols-3">
```

### BottomNav vs Sidebar pattern

```tsx
<Sidebar className="hidden md:flex" />
<div className="md:pl-72">
  <main className="pb-24 md:pb-6">{children}</main>
</div>
<BottomNav className="md:hidden" />
```

### Font tiếng Việt

```tsx
// app/layout.tsx
const notoSans = Noto_Sans({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
});
```

---

## 11. Import Order

```typescript
// 1. React / Next.js core
import { useState, useEffect } from "react";
import { redirect } from "next/navigation";

// 2. External libraries
import { format } from "date-fns";
import { z } from "zod";

// 3. Internal: lib utilities
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { hasPermission, canUseAI } from "@/lib/permissions";
import { embedText, isEmbeddingAvailable } from "@/lib/embeddings";
import { retrieveWithArticleExpansion } from "@/lib/rag-article-expansion";
import { isFollowUpQuestion, loadConversationHistory } from "@/lib/rag-conversation";
import { streamChat, getActiveProvider } from "@/lib/ai";

// 4. Internal: components
import { Button } from "@/components/ui/button";
import { ChatInterface } from "@/components/ai/chat-interface";

// 5. Internal: server actions
import { createTask } from "@/actions/task";
import { uploadLegalDocument } from "@/actions/legal";

// 6. Types only
import type { Role, DocType } from "@prisma/client";
import type { ArticleGroup } from "@/lib/rag-article-expansion";
import type { ChatMessage } from "@/lib/ai";
```

---

## 12. Vietnamese-First Convention

### UI Text

```tsx
// GOOD — tiếng Việt
<Button>Tạo nhiệm vụ</Button>
<Input placeholder="Nhập tiêu đề..." />
return { error: "Không tìm thấy nhiệm vụ" };

// BAD — tiếng Anh trong UI
<Button>Create Task</Button>
```

### Technical Terms trong code — tiếng Anh OK

```typescript
// Comments và variable names: tiếng Anh OK
// BM25 IDF calculation with length normalization
const idf = new Map<string, number>();

// UI labels: tiếng Việt
const STATUS_LABELS = {
  PENDING: "Cần thực hiện",
  IN_PROGRESS: "Đang xử lý",
  COMPLETED: "Hoàn thành",
  OVERDUE: "Quá hạn",
};
```

### Địa danh và chức danh — đúng chính thức

```typescript
// Đúng
"Phòng Kinh Tế Xã Trần Phú"
"Trưởng phòng", "Phó Trưởng phòng", "Trưởng bộ phận"
"Bộ phận Tài chính - Kế hoạch"
"Tổ 1 - Kiểm tra đất đai, TTXD"

// Sai
"Kinh Te Department"
"Team Leader"
```

### RAG prompts — tiếng Việt đầy đủ

Tất cả prompts gửi cho AI (RAG_SYSTEM_PROMPT, buildArticleGroupedMessage) đều viết tiếng Việt để AI respond tốt hơn với tiếng Việt.

---

## 13. Database Patterns

### Prisma client singleton

```typescript
// lib/db.ts — luôn import từ đây
import { db } from "@/lib/db";
```

### Select fields cẩn thận

```typescript
// GOOD: chỉ select cần thiết
const tasks = await db.task.findMany({
  include: {
    assignee: { select: { id: true, name: true, position: true } },
    creator: { select: { id: true, name: true } },
    _count: { select: { progressReports: true } },
  },
  take: 200, // Luôn có giới hạn
});

// BAD: include toàn bộ
const tasks = await db.task.findMany({
  include: { assignee: true, progressReports: true },
});
```

### Upsert cho idempotent operations

```typescript
await db.taskGroup.upsert({
  where: { code: "to-1" },
  update: {},
  create: { code: "to-1", name: "Tổ 1 - Kiểm tra đất đai, TTXD" },
});
```

### Raw SQL chỉ cho vector operations

```typescript
// CHỈ dùng $queryRawUnsafe / $executeRawUnsafe cho pgvector
// Tất cả operations khác qua Prisma typed queries
await db.$executeRawUnsafe(
  `UPDATE legal_chunks SET embedding = $1::vector WHERE id = $2`,
  vectorToSql(vec), id
);
```

### Indexes đã định nghĩa

- `tasks`: `(assigneeId)`, `(taskGroupId)`, `(status)`, `(deadline)`, `(sourceType, sourceId)`
- `legal_chunks`: `(documentId)` + IVFFlat `(embedding vector_cosine_ops)` khi >= 100 rows
- `conversations`: `(userId, updatedAt)`, `(createdAt)`
- `chat_histories`: `(userId)`, `(conversationId)`, `(createdAt)`
- `notifications`: `(userId, isRead)`, `(createdAt)`

---

## 14. Testing Expectations

### Sau mỗi feature — test ngay

Workflow rule: **vừa implement xong → test ngay**, không để tích lũy bug.

### Test checklist cho Server Actions

- [ ] Authentication: reject khi không có session
- [ ] Authorization: reject khi sai role/permission
- [ ] Validation: trả `{ error }` khi input invalid
- [ ] Success: trả `{ success: true }` và data chính xác
- [ ] Side effects: `revalidatePath()` đúng route
- [ ] Notifications: tạo khi cần (giao việc, v.v.)

### Test checklist cho RAG

- [ ] Hybrid retrieval trả chunks relevant cho câu hỏi pháp luật cụ thể
- [ ] Article expansion pull đủ tất cả Khoản của Điều
- [ ] Follow-up detection đúng với các mẫu câu tiếng Việt
- [ ] Fallback tầng 2 khi embedding không khả dụng
- [ ] Fallback tầng 3 khi hybrid không có kết quả
- [ ] Multi-turn messages array build đúng thứ tự (cũ → mới)
- [ ] Chunk reuse cho follow-up đúng conversation

### Test checklist cho AI module

- [ ] `/api/ai/chat` không trả về provider/model name trong response hoặc SSE events
- [ ] `/api/ai/status` chỉ trả `{ available: boolean }`
- [ ] Error message không lộ tên SDK, URL, vendor
- [ ] SSE stream hoạt động đúng: sources event → text events → [DONE]
- [ ] `maxTokens=6000` được pass đúng

### Test checklist cho RBAC

- [ ] TRUONG_PHONG thấy tất cả data, có thể confirm task
- [ ] PHO_TP thấy tất cả, có thể confirm task, KHÔNG có user:manage/legal:manage/ubnd:create
- [ ] TRUONG_BO_PHAN chỉ thấy task/iHanoi/TTHC/báo cáo trong dept của mình
- [ ] CHUYEN_VIEN chỉ thấy task của mình, KHÔNG tạo task, KHÔNG confirm
- [ ] NHAN_VIEN chỉ thấy task của mình, AI scope-restricted, KHÔNG thấy iHanoi/TTHC
- [ ] Redirect đúng khi không đủ quyền

### Scripts test sẵn có

```bash
# Trong thư mục app/
npx tsx scripts/test-hybrid-rag.ts           # Test hybrid retrieval
npx tsx scripts/test-article-expansion.ts    # Test article expansion
npx tsx scripts/test-conversation-context.ts # Test follow-up detection
npx tsx scripts/test-embedding.ts            # Test Gemini embedding API
npx tsx scripts/diagnose-rag.ts              # Diagnose production RAG issues
npx tsx scripts/test-rbac.ts                 # Test toàn bộ permission matrix
npx tsx scripts/test-review-workflow.ts      # Test task workflow start/submit/confirm
npx tsx scripts/test-task-notes.ts           # Test TaskNote CRUD + permission
npx tsx scripts/test-risk-scanner.ts         # Test background risk scanner
npx tsx scripts/test-agent.ts                # Test AI agent read tools
npx tsx scripts/test-agent-write.ts          # Test AI agent write tools + dry-run
npx tsx scripts/list-users.ts                # Liệt kê 21 users + role + dept
```

---

## 15. AI Tool Definition Pattern

### ToolDefinition structure

```typescript
// lib/ai-tools/types.ts
type ToolDefinition = {
  name: string;
  description: string;    // Tiếng Việt — giúp LLM chọn tool đúng
  parameters: JSONSchema; // Mô tả input args cho LLM function calling
  requiresRole?: Role[];  // Nếu set → từ chối caller không có role này
  execute: (args: unknown, ctx: ToolContext) => Promise<ToolResult>;
};
```

### Đăng ký tool trong registry

```typescript
// lib/ai-tools/registry.ts
import { getTaskStatsTool } from "./tools/task-tools";
import { createTaskTool } from "./tools/write-tools";

export const TOOL_REGISTRY: Map<string, ToolDefinition> = new Map([
  ["getTaskStats", getTaskStatsTool],
  ["createTask", createTaskTool],
  // ...
]);
```

### Dry-run cho write tools

Write tool BẮT BUỘC kiểm tra `ctx.confirmed` trước khi thực thi. Pattern:

```typescript
export const createTaskTool: ToolDefinition = {
  name: "createTask",
  requiresRole: ["TRUONG_PHONG", "PHO_TP", "TRUONG_BO_PHAN"],
  execute: async (args, ctx) => {
    const validated = createTaskSchema.parse(args);

    if (!ctx.confirmed) {
      // DRY RUN: preview, không ghi DB
      return {
        __pendingAction: {
          toolName: "createTask",
          input: validated,       // Snapshot input đã validate để re-submit
          preview: `Tạo nhiệm vụ "${validated.title}" cho ${validated.assigneeName}, deadline ${formatDate(validated.deadline)}`,
        }
      };
    }

    // THỰC THI: ctx.confirmed = true (từ /api/ai/confirm-action)
    const task = await db.task.create({ ... });
    await db.aIAuditLog.create({ action: "tool:createTask", ... });
    return { success: true, taskId: task.id };
  }
};
```

**Lưu ý:** `input` trong `__pendingAction` là input ĐÃ VALIDATE — client gửi lại nguyên xi khi confirm, server không validate lần 2. Đảm bảo snapshot đủ thông tin để re-submit.

### System prompt role-aware

```typescript
// lib/ai-tools/system-prompt.ts
export function buildAgentSystemPrompt(user: { role: Role; name: string; department: Department }) {
  const scopeDesc = isTopLeader(user.role)
    ? "Bạn có thể xem tất cả dữ liệu trong toàn phòng."
    : isDeptManager(user.role)
    ? `Bạn chỉ thấy dữ liệu trong bộ phận ${DEPARTMENT_LABELS[user.department]}.`
    : "Bạn chỉ thấy công việc được giao trực tiếp cho bạn.";

  return `Bạn là trợ lý AI của Phòng Kinh Tế Xã Trần Phú. ${scopeDesc} ...`;
}
```

---

## 16. Task State Machine Pattern

### Valid transitions

```typescript
// actions/task.ts
const VALID_STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  PENDING:          ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS:      ["AWAITING_REVIEW", "CANCELLED"],
  AWAITING_REVIEW:  ["COMPLETED", "IN_PROGRESS"],  // confirm → COMPLETED, reject → IN_PROGRESS
  COMPLETED:        [],   // terminal
  OVERDUE:          ["IN_PROGRESS", "CANCELLED"],
  CANCELLED:        [],   // terminal
};
```

### Action → Transition mapping

```typescript
type TaskAction = "start" | "submit" | "confirm" | "reject" | "cancel";

const ACTION_TO_TRANSITION: Record<TaskAction, { from: TaskStatus; to: TaskStatus }> = {
  start:   { from: "PENDING",         to: "IN_PROGRESS" },
  submit:  { from: "IN_PROGRESS",     to: "AWAITING_REVIEW" },
  confirm: { from: "AWAITING_REVIEW", to: "COMPLETED" },
  reject:  { from: "AWAITING_REVIEW", to: "IN_PROGRESS" },
  cancel:  { from: "*",               to: "CANCELLED" },
};
```

### Permission check cho mỗi action

```typescript
function checkStatusTransitionPermission(action: TaskAction, user: User, task: Task): boolean {
  switch (action) {
    case "start":   return task.assigneeId === user.id;            // Chỉ assignee
    case "submit":  return task.assigneeId === user.id;            // Chỉ assignee
    case "confirm": return hasPermission(user.role, "task:approve"); // TP/PTP
    case "reject":  return hasPermission(user.role, "task:approve"); // TP/PTP
    case "cancel":  return hasPermission(user.role, "task:delete") || task.creatorId === user.id;
  }
}
```

### Fields cập nhật theo action

| Action | Field được set |
|--------|---------------|
| `start` | `startedAt = now()`, `status = IN_PROGRESS` |
| `submit` | `submittedAt = now()`, `status = AWAITING_REVIEW` |
| `confirm` | `confirmedById = user.id`, `confirmedAt = now()`, `completedAt = now()`, `status = COMPLETED` |
| `reject` | `submittedAt = null`, `status = IN_PROGRESS` |
| `cancel` | `status = CANCELLED` |

---

## 17. Snapshot Pattern

Khi dữ liệu có thể thay đổi theo thời gian nhưng cần giữ nguyên trạng thái lịch sử, dùng snapshot fields.

Ví dụ: `TaskNote.authorName`, `authorPosition`, `authorRole` — ghi lại lúc tạo note. Nếu cán bộ sau đổi chức vụ, note vẫn hiển thị đúng chức vụ lúc viết.

```typescript
// Trong createTaskNote():
const note = await db.taskNote.create({
  data: {
    taskId,
    authorId: user.id,
    content,
    // Snapshot — không thay đổi sau khi tạo
    authorName: user.name,
    authorPosition: user.position,
    authorRole: user.role,
  }
});
```

**Nguyên tắc:** Snapshot chỉ dùng cho trường hợp thông tin có thể thay đổi nhưng giá trị lúc tạo là quan trọng. Không snapshot tất cả fields (tốn DB).

---

## 18. Notification Convention

### Type strings chuẩn

```typescript
type NotificationType =
  // Task lifecycle
  | "TASK_ASSIGNED"        // Task được giao cho user
  | "TASK_OVERDUE"         // Task quá hạn
  | "TASK_NOTE"            // Lãnh đạo gửi lời nhắn
  // Báo cáo
  | "REPORT_DUE"           // Nhắc nhở viết báo cáo tuần/tháng
  // UBND
  | "UBND_NEW"             // Có chỉ đạo UBND mới
  // Risk (từ background scanner)
  | "RISK_OVERDUE"
  | "RISK_DEADLINE_SOON"
  | "RISK_STALE_PENDING"
  | "RISK_UBND_DEADLINE"
  | "RISK_OVERLOAD"
  | "RISK_NO_REPORT"
  | "RISK_AWAITING_REVIEW";
```

### Tạo notification

```typescript
await db.notification.create({
  data: {
    userId: recipientId,
    type: "TASK_NOTE",
    title: "Trưởng phòng đã gửi lời nhắn",
    message: `${note.authorName}: "${note.content.substring(0, 100)}..."`,
    link: `/tasks/${taskId}`,
  }
});
```

### Dedup cho RISK notifications

Risk scanner dedup 24h per `(userId, type, entityId)` — không dùng Prisma unique constraint mà check thủ công:

```typescript
const existing = await db.notification.findFirst({
  where: {
    userId,
    type: riskType,
    link: entityLink,
    createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
  }
});
if (!existing) await db.notification.create(...);
```
