# App Quản Lý Phòng Kinh Tế Xã Trần Phú

Hệ thống quản lý nội bộ cho **Phòng Kinh Tế Xã Trần Phú, TP Hà Nội** — phục vụ 21 cán bộ.

## Tech Stack

| Thành phần | Công nghệ |
|------------|----------|
| Framework | Next.js 16 App Router |
| Language | TypeScript (strict mode) |
| Database | PostgreSQL 16 + pgvector |
| ORM | Prisma 6 |
| Auth | Better Auth (scrypt, session cookie) |
| UI | shadcn/ui + Tailwind CSS v4 |
| AI Chat | Gemini 2.5 Flash / DeepSeek Chat / Claude Sonnet |
| AI Embed | Gemini `gemini-embedding-001` (768 dim) |
| Deploy | Docker Compose + Nginx (output: standalone) |

## Quick Start

### 1. Yêu cầu

- Node.js 20+
- PostgreSQL 16 với pgvector extension
- Ít nhất 1 Gemini API key (bắt buộc cho embedding + chat)

### 2. Setup môi trường

```bash
cp .env.example .env.local
# Chỉnh sửa .env.local với các giá trị thực
```

Các biến bắt buộc:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/phong_kinh_te_dev
BETTER_AUTH_SECRET=dev-secret-min-32-chars
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
GEMINI_API_KEY=your-gemini-api-key
```

### 3. Database setup

```bash
npm install
npx prisma migrate dev       # Tạo tables
npx prisma db seed           # Seed 21 users + task groups
npx tsx scripts/add-embedding-column.ts  # Thêm vector(768) column
```

### 4. Chạy dev server

```bash
npm run dev
# Mở http://localhost:3000
```

## Tính năng chính

### Quản lý công việc (với workflow xác nhận)
- Giao việc top-down theo cấp quyền (RBAC 5 cấp)
- Workflow 4 bước: `PENDING → IN_PROGRESS → AWAITING_REVIEW → COMPLETED`
- TP/PTP xác nhận hoàn thành — assignee không tự đánh dấu xong
- Sub-tasks, nguồn nhiệm vụ (nội bộ / UBND / iHanoi)

### Lời nhắn lãnh đạo (TaskNote)
- TP/PTP/TBP gửi lời nhắn cho assignee trên task
- Assignee xem "Lời nhắn dành cho bạn"
- Ghim note quan trọng (chỉ TP)

### Trợ lý AI — Agent + Pháp lý
- **AI Agent:** 6 read tools + 5 write tools (với confirmation)
- **Hybrid RAG:** Article Expansion → Vector+BM25 → BM25 fallback
- **Background Risk Scanner:** Cron 30 phút, 7 loại rủi ro
- Multi-provider: Gemini 2.5 Flash (ưu tiên) → DeepSeek → Anthropic

### Nghiệp vụ hành chính
- Chỉ đạo UBND: nhập, giao, theo dõi, phản hồi
- Phản ánh iHanoi: nhập thủ công, giao xử lý
- Hồ sơ TTHC: tiếp nhận → xử lý → hoàn thành/trả lại
- Lịch công tác tuần/tháng
- Báo cáo tổng hợp + xuất CSV

## Tài khoản test (5 role mẫu)

Mật khẩu mặc định: `ChangeMe@2026`

| Email | Vai trò | Ghi chú |
|-------|---------|---------|
| `vu.van.tuan@tranphu.gov.vn` | TRUONG_PHONG | Toàn quyền hệ thống |
| `tran.tuan.minh@tranphu.gov.vn` | PHO_TP | Gần như TP |
| `vu.huy.tu@tranphu.gov.vn` | TRUONG_BO_PHAN | BP Tài chính - Kế hoạch |
| `nguyen.danh.hung@tranphu.gov.vn` | CHUYEN_VIEN | Tổ 1, task của mình |
| `nguyen.thi.dung@tranphu.gov.vn` | NHAN_VIEN | Thủ quỹ, quyền tối thiểu |

Xem danh sách 21 users: `npx tsx scripts/list-users.ts`

## Background Cron (Risk Scanner)

Cron job ngoài gọi mỗi 30 phút:

```
GET https://your-domain.vn/api/cron/risk-scan?secret=CRON_SECRET
```

Xem hướng dẫn chi tiết: [app/docs/ai-monitor-cron.md](docs/ai-monitor-cron.md)

## RBAC — 5 cấp quyền

| Role | Mô tả |
|------|-------|
| `TRUONG_PHONG` | Toàn quyền hệ thống |
| `PHO_TP` | Gần như TP (không có user:manage, legal:manage, ubnd:create) |
| `TRUONG_BO_PHAN` | Quyền trong bộ phận (hỗ trợ đa bộ phận) |
| `CHUYEN_VIEN` | Task được giao + workflow assignee + AI full |
| `NHAN_VIEN` | Task của mình + lịch cá nhân + AI giới hạn |

## Scripts hữu ích

```bash
npx tsx scripts/test-rbac.ts            # Test permission matrix
npx tsx scripts/test-review-workflow.ts # Test task workflow
npx tsx scripts/test-task-notes.ts      # Test TaskNote
npx tsx scripts/test-risk-scanner.ts    # Test risk scanner
npx tsx scripts/test-agent.ts           # Test AI agent tools
npx tsx scripts/diagnose-rag.ts         # Debug RAG production
```

## Tài liệu

- [Project Overview & PDR](../docs/project-overview-pdr.md)
- [System Architecture](../docs/system-architecture.md)
- [Codebase Summary](../docs/codebase-summary.md)
- [Code Standards](../docs/code-standards.md)
- [Project Roadmap](../docs/project-roadmap.md)
- [Deployment Guide](../docs/deployment-guide.md)
- [Cron Setup](docs/ai-monitor-cron.md)
