# Code Standards — App PKT Xã Trần Phú

**Cập nhật:** 2026-05-11 (sau Security Overhaul P1-P4)

---

## 1. Nguyên tắc chung

- **TypeScript strict mode** — `strict: true` trong `tsconfig.json`. Không dùng `any` tùy tiện.
- **Server-first** — logic quan trọng (auth, permission check, encryption) luôn ở server side (Server Actions hoặc Route Handlers).
- **Defense-in-depth** — kiểm tra permission ở nhiều lớp: middleware → action → DB query scope.
- **Fail-safe** — khi có lỗi crypto hoặc auth, throw rõ ràng, không trả dữ liệu partial.

---

## 2. Cấu trúc file & naming

### Server Actions (`actions/`)

```typescript
// Pattern chuẩn cho mọi server action
"use server";

export async function someAction(input: z.infer<typeof schema>) {
  // 1. Validate input
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input" };

  // 2. Auth check
  const session = await requireSession();  // throw nếu chưa login

  // 3. Permission check
  if (!hasPermission(session.user.role, "permission:key")) {
    return { error: "Không có quyền" };
  }

  // 4. Business logic + scope guard
  // ...

  // 5. Return { data } hoặc { error }
}
```

### Lib files (`lib/`)

- Pure functions, không import React
- Export named exports (không default export)
- Mỗi module một concern (crypto, security, permissions, v.v.)

### Components (`components/`)

- Client components dùng `"use client"` directive
- Server components không có directive
- Tên file: `kebab-case.tsx`
- Tên component: `PascalCase`

---

## 3. Pattern bảo mật (Security Patterns)

### 3.1 Password hashing

```typescript
import { hashPassword, verifyPassword, rehashIfNeeded } from "@/lib/crypto/password";

// Hash mật khẩu mới
const hash = await hashPassword(plaintext);  // Argon2id + pepper

// Verify (tự detect bcrypt legacy)
const { valid, needsRehash } = await verifyPassword(plaintext, storedHash);

// Sau khi verify thành công, tự động migrate sang Argon2id nếu cần
if (valid && needsRehash) {
  await rehashIfNeeded(userId, plaintext);
}
```

### 3.2 Password policy check

```typescript
import { checkPasswordStrength } from "@/lib/crypto/password-policy";

const result = checkPasswordStrength(password, {
  email: user.email,
  name: user.name,
});
if (!result.valid) {
  return { error: result.errors.join(", ") };
}
```

### 3.3 Field-level encryption (tự động qua Prisma extension)

Encryption/decryption xảy ra **tự động** qua Prisma extension — không cần code thêm trong action:

```typescript
// Trong action hoặc API — dùng db bình thường
import { db } from "@/lib/db";  // db đã có field-cipher extension

// Ghi: tự động encrypt trước khi INSERT
await db.iHanoiComplaint.create({
  data: { citizenName: "Nguyễn Văn A", citizenPhone: "0901234567", ... }
});
// → DB lưu: citizenName = "enc:AQ...", citizenPhone = "enc:AQ..."

// Đọc: tự động decrypt sau khi SELECT
const complaint = await db.iHanoiComplaint.findFirst({ ... });
// → complaint.citizenName = "Nguyễn Văn A" (plaintext)
```

**Danh sách fields encrypt** (config trong `lib/crypto/field-cipher.ts`):
- `iHanoiComplaint`: `content`, `citizenName`, `citizenPhone`, `citizenAddress`, `resolution`
- `tTHCRecord`: `applicantName`, `applicantPhone`, `notes`
- `taskNote.content`, `task.description`, `progressReport.notes`, `progressReport.blockers`
- `uBNDDirective.content`, `uBNDDirective.phongResponse`
- `chatHistory.question`, `chatHistory.answer`
- `notification.message`
- `account.accessToken`, `account.refreshToken`, `account.idToken`
- `user.phone`, `user.responsibilities`

### 3.4 Blind index — search trên encrypted data

Khi cần search theo field đã encrypt, dùng blind index thay vì decrypt-all:

```typescript
import { exactBidx, trigramBidx } from "@/lib/crypto/blind-index";

// Search theo số điện thoại (exact match)
const phoneBidx = await exactBidx("user.phone", "0901234567");
const user = await db.user.findUnique({ where: { phoneBidx } });

// Search theo tên (fuzzy — trigram)
const nameBidx = await trigramBidx("iHanoiComplaint.citizenName", "Nguyễn Văn");
const complaints = await db.iHanoiComplaint.findMany({
  where: { citizenNameBidx: { hasSome: nameBidx } }
});
```

**Lưu ý quan trọng:**
- `exactBidx` dùng key riêng `BLIND_INDEX_KEY` — không dùng `DATA_ENCRYPTION_KEY`
- Mỗi field có context string khác nhau (vd `"user.phone.v1"`) để tránh cross-field leakage
- Blind index lưu riêng (`phoneBidx`, `citizenNameBidx[]`) — không phải field encrypt

### 3.5 Session & auth check

```typescript
import { requireSession } from "@/lib/session";
import { hasPermission, isTopLeader, isDeptManager } from "@/lib/permissions";

// Trong Server Action — throw nếu chưa login hoặc 2FA chưa pass
const session = await requireSession();
const { user } = session;

// Kiểm tra role
if (isTopLeader(user.role)) {
  // TP hoặc PTP
}
if (isDeptManager(user.role)) {
  // TRUONG_BO_PHAN
}

// Kiểm tra permission key
if (!hasPermission(user.role, "task:create")) {
  return { error: "Không có quyền tạo task" };
}
```

### 3.6 Scope guard cho TruongBoPhan

```typescript
import { getManagedDepartments } from "@/lib/permissions";

// Trong query — filter theo scope
let where: Prisma.TaskWhereInput = { deletedAt: null };

if (isTopLeader(user.role)) {
  // Không filter — xem tất
} else if (isDeptManager(user.role)) {
  const managed = getManagedDepartments(user);
  where.OR = [
    { assigneeId: user.id },
    { assignee: { department: { in: managed } } },
  ];
} else {
  // Staff — chỉ task của mình
  where.assigneeId = user.id;
}

// Cross-dept guard khi TBP tạo task cho người khác
if (isDeptManager(user.role) && data.assigneeId) {
  const target = await db.user.findUnique({
    where: { id: data.assigneeId },
    select: { department: true },
  });
  const managed = getManagedDepartments(user);
  if (!target || !managed.includes(target.department)) {
    return { error: "Người được giao ngoài bộ phận quản lý" };
  }
}
```

### 3.7 Task workflow transitions

Chỉ dùng action enum — không set raw status:

```typescript
// actions/task.ts
// Valid transitions theo state machine
const VALID_STATUS_TRANSITIONS = {
  start: { from: "PENDING", to: "IN_PROGRESS" },
  submit: { from: "IN_PROGRESS", to: "AWAITING_REVIEW" },
  confirm: { from: "AWAITING_REVIEW", to: "COMPLETED" },
  reject: { from: "AWAITING_REVIEW", to: "IN_PROGRESS" },
  cancel: { from: ["PENDING", "IN_PROGRESS", "AWAITING_REVIEW"], to: "CANCELLED" },
};

// Kiểm tra permission theo action (không theo status raw)
// - start/submit/addProgressReport: chỉ assignee
// - confirm/reject: chỉ TP/PTP
// - cancel: creator hoặc TP/PTP
```

### 3.8 Lockout check trong login flow

```typescript
import { checkLoginAllowed, recordFailedAttempt, resetFailedAttempts } from "@/lib/security/login-protection";
import { verifyCaptcha } from "@/lib/security/captcha";

// loginAction (actions/auth.ts)
const lockStatus = await checkLoginAllowed(email, ipAddress);
if (!lockStatus.allowed) {
  return { error: lockStatus.reason, lockedUntil: lockStatus.lockedUntil };
}

// Nếu fail count >= 2, require captcha
if (lockStatus.failCount >= 2) {
  if (!captchaToken) return { error: "Yêu cầu xác minh captcha" };
  const captchaOk = await verifyCaptcha(captchaToken, ipAddress);
  if (!captchaOk) return { error: "Xác minh captcha thất bại" };
}

// Verify password
const { valid, needsRehash } = await verifyPassword(password, user.passwordHash);
if (!valid) {
  await recordFailedAttempt(user.id, ipAddress);
  return { error: "Sai mật khẩu" };
}

// Login thành công
await resetFailedAttempts(user.id, ipAddress);
```

### 3.9 Security event logging

```typescript
import { logSecurityEvent } from "@/lib/security/security-events";

await logSecurityEvent(userId, "NEW_DEVICE", {
  deviceId,
  ipAddress,
  userAgent,
  location: "Hà Nội",
});
// Các type: NEW_DEVICE, IMPOSSIBLE_TRAVEL, ACCOUNT_LOCKED, LOCKOUT_IP,
//           TWO_FACTOR_ENABLED, TWO_FACTOR_DISABLED, PASSWORD_CHANGED,
//           SESSION_REVOKED, SUSPICIOUS_SESSION
```

### 3.10 AI tools — không tiết lộ provider

```typescript
// ĐÚNG — không để lộ tên model/provider ra UI hay API response
return { answer: "..." };  // không có "model", "provider" field

// SAI
return { answer: "...", model: "gemini-2.5-flash", provider: "Google" };
```

---

## 4. Database patterns

### Soft delete

Tasks dùng soft delete (`deletedAt`). Luôn filter trong query:

```typescript
const tasks = await db.task.findMany({
  where: { deletedAt: null, ...yourFilter }
});
```

### Prisma client import

Luôn dùng `db` từ `@/lib/db` (đã có field-cipher extension applied):

```typescript
import { db } from "@/lib/db";  // ĐÚNG — có encryption extension

// SAI — không import PrismaClient trực tiếp
import { PrismaClient } from "@prisma/client";
```

### Resolve session theo ID

Không dùng `findFirst({ where: { userId } })` cho session — luôn resolve theo exact `session.id`:

```typescript
// ĐÚNG
const session = await db.session.findUnique({ where: { id: sessionId } });

// SAI — không tìm session theo userId
const session = await db.session.findFirst({ where: { userId } });
```

---

## 5. Error handling

### Server Actions

```typescript
// Luôn return { error: string } hoặc { data: T }
// Không throw từ Server Action (client sẽ crash)
try {
  const result = await doSomething();
  return { data: result };
} catch (err) {
  console.error("[action-name]", err);
  return { error: "Có lỗi xảy ra, vui lòng thử lại" };
}
```

### Crypto errors

```typescript
// Khi decrypt fail — throw thay vì return garbage
// Prisma extension đã handle: nếu field không phải enc: prefix → trả nguyên
// Nếu decrypt fail → log + throw để tránh trả ciphertext ra UI
```

---

## 6. Env variables

### Kiểm tra bắt buộc khi khởi động

```typescript
// lib/crypto/envelope.ts tự check khi import
const key = process.env.DATA_ENCRYPTION_KEY;
if (!key || key.length !== 64) {
  throw new Error("DATA_ENCRYPTION_KEY must be 64 hex chars");
}
```

### Quy tắc

- Biến public (client): prefix `NEXT_PUBLIC_`
- Keys bí mật: KHÔNG bao giờ có prefix `NEXT_PUBLIC_`
- Development: dùng `.env.local` (gitignored)
- Production: inject qua `/etc/loha/app.env` (xem deployment-guide.md)

---

## 7. Logging & monitoring

### Không log PII

```typescript
// SAI
console.log("Login attempt:", email, password);
console.log("User data:", user);

// ĐÚNG — log action, không log data
console.log("[auth] login attempt for user:", userId);
console.log("[crypto] encrypt field failed for model:", modelName);
```

### AIAuditLog

Mọi AI interaction (chat, agent tool call, risk scan) đều log vào `AIAuditLog`:

```typescript
await db.aIAuditLog.create({
  data: {
    userId,
    action: "chat:message",  // hoặc "tool:createTask", "monitor:risk-scan"
    success: true,
    duration: Date.now() - startTime,
    output: { ... },  // JSON summary, KHÔNG chứa PII
  }
});
```

### AdminAuditLog

Mọi hành động admin (reset password, unlock account, change role) log vào `AdminAuditLog`.

---

## 8. Frontend patterns

### Form validation

Dùng React Hook Form + Zod schema (schema share với server action):

```typescript
const schema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
});

// Client: useForm({ resolver: zodResolver(schema) })
// Server: schema.safeParse(formData)
```

### Loading states

Dùng `useTransition` hoặc `useFormStatus` cho Server Actions:

```typescript
const [isPending, startTransition] = useTransition();

startTransition(async () => {
  const result = await someServerAction(data);
  if (result.error) toast.error(result.error);
});
```

### Toast notifications

Dùng shadcn/ui Toast component. Không dùng `alert()`.

---

## 9. Testing

### Script pattern

```typescript
// scripts/test-*.ts — standalone scripts, không phụ thuộc test framework
import { db } from "@/lib/db";

async function main() {
  let pass = 0; let fail = 0;

  // Test case
  const result = await someFunction(input);
  if (result === expected) {
    console.log("PASS: test name");
    pass++;
  } else {
    console.error("FAIL: test name", { expected, got: result });
    fail++;
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(console.error);
```

### Cleanup

Scripts test luôn cleanup data sau khi chạy (hoặc dùng `cleanup-test-data.ts`).
