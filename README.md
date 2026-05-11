# App Quản Lý Phòng Kinh Tế - Xã Trần Phú, Hà Nội

Hệ thống quản lý nội bộ cho **Phòng Kinh Tế Xã Trần Phú, TP Hà Nội**. 21 cán bộ, 5 cấp quyền, 7 module chức năng. Mobile-first, tiếng Việt 100%, tự host.

## Tech Stack

| Layer | Công nghệ |
|-------|-----------|
| Frontend | Next.js 16 App Router + TypeScript + React 19 |
| Auth | Better Auth (5-tier RBAC, session-based, scrypt) |
| Database | PostgreSQL 16 + Prisma 6 ORM + pgvector |
| AI | Multi-provider: Gemini / DeepSeek / Claude (auto-select, provider ẩn) + Gemini Embedding |
| RAG | Hybrid: vector (pgvector cosine) + BM25 re-rank + Article Expansion + Conversation context |
| UI | shadcn/ui + Radix Primitives + Tailwind CSS v4 + Noto Sans Vietnamese |
| PDF OCR | pdf-parse v2 + pdf-lib + Gemini Vision (parallel batch OCR) |
| Deploy | Docker Compose + Nginx + Let's Encrypt |
| Storage | Local filesystem (Docker volume) |

## Quick Start (Development)

```bash
# 1. Postgres + pgvector
docker run -d --name pkt-postgres \
  -e POSTGRES_USER=pkt -e POSTGRES_PASSWORD=pkt2026secret -e POSTGRES_DB=phong_kinh_te \
  -p 5435:5432 pgvector/pgvector:pg16

# 2. Cài dependencies
cd app && npm install

# 3. Cấu hình env (copy và điền DATABASE_URL, BETTER_AUTH_SECRET, AI key)
cp .env.example .env.local

# 4. Tạo schema + seed 21 users
npm run db:push && npm run db:seed

# 5. Thêm cột embedding (cần 1 lần)
npx tsx scripts/add-embedding-column.ts

# 6. Chạy dev server
npm run dev
# Mở http://localhost:3000
# Login: tuan.vv@phongkinhte-tranphu.vn / ChangeMe@2026
```

## Production Deploy (Docker)

```bash
# 1. Trên VPS Ubuntu hoặc server vật lý UBND
git clone <repo> /opt/pkt && cd /opt/pkt

# 2. Cấu hình env production
cp .env.example .env
# Điền: DB_USER, DB_PASSWORD, BETTER_AUTH_SECRET, DOMAIN, AI keys

# 3. Build + start toàn bộ stack
docker compose -f docker-compose.prod.yml up -d --build

# 4. Khởi tạo DB (lần đầu)
docker compose -f docker-compose.prod.yml exec nextjs sh scripts/init-db.sh

# 5. Kiểm tra
curl https://your-domain.vn/api/health
```

Backup PostgreSQL tự động mỗi ngày lúc 02:00 AM vào `./backups/` (retention 30 ngày).

## Cấu Trúc Thư Mục

```
BAN KINH TE/
├── app/                   ← Next.js application
│   ├── app/               ← Pages (App Router)
│   │   ├── (auth)/login/  ← Trang đăng nhập
│   │   ├── (dashboard)/   ← Tất cả trang dashboard
│   │   └── api/           ← API routes (auth, ai/chat, ai/status)
│   ├── components/        ← React components (ui, layout, task, ubnd, ai...)
│   ├── lib/               ← auth, db, session, permissions, ai, rag*, embeddings, pdf-ocr
│   ├── actions/           ← Server Actions (task, ubnd, ihanoi, tthc, schedule, legal)
│   ├── prisma/            ← schema.prisma (15 models) + seed.ts (21 users)
│   ├── scripts/           ← Migration + test scripts (add-embedding-column, backfill-embeddings...)
│   └── Dockerfile
├── nginx/                 ← Nginx reverse proxy config + SSL placeholder
├── backups/               ← PostgreSQL dumps (auto-generated)
├── docs/                  ← Tài liệu kỹ thuật (xem bên dưới)
├── docker-compose.yml
└── .env.example
```

## 21 Users Seed

Mật khẩu mặc định: `ChangeMe@2026` — bắt buộc đổi sau lần đăng nhập đầu tiên.

| Email | Họ tên | Vai trò |
|-------|--------|---------|
| tuan.vv@phongkinhte-tranphu.vn | Vũ Văn Tuấn | Trưởng phòng |
| minh.tt@phongkinhte-tranphu.vn | Trần Tuấn Minh | Phó Trưởng phòng |
| tu.vh@phongkinhte-tranphu.vn | Vũ Huy Tư | Trưởng BP Tài chính-KH |
| hoan.nt@phongkinhte-tranphu.vn | Nguyễn Thị Hoan | Chuyên viên |
| phuc.ltn@phongkinhte-tranphu.vn | Lương Thị Ngọc Phúc | Chuyên viên |
| dung.nt@phongkinhte-tranphu.vn | Nguyễn Thị Dung | Nhân viên - Thủ quỹ |
| hoi.dx@phongkinhte-tranphu.vn | Đinh Xuân Hội | Trưởng BP NN-MT, XD-CT |
| thuan.td@phongkinhte-tranphu.vn | Trịnh Duy Thuân | Chuyên viên |
| tuoi.tt@phongkinhte-tranphu.vn | Trương Thị Tươi | Chuyên viên tổng hợp |
| chinh.vc@phongkinhte-tranphu.vn | Vương Công Chính | Chuyên viên |
| hai.vt@phongkinhte-tranphu.vn | Vũ Thị Hải | Chuyên viên |
| hung.nd@phongkinhte-tranphu.vn | Nguyễn Danh Hùng | CV - Tổ trưởng Tổ 1 |
| chung.dq@phongkinhte-tranphu.vn | Đặng Quốc Chung | Chuyên viên (Tổ 1) |
| thuy.nq@phongkinhte-tranphu.vn | Nguyễn Quốc Thủy | Chuyên viên (Tổ 1) |
| hop.hv@phongkinhte-tranphu.vn | Hoàng Văn Hợp | CV - Tổ trưởng Tổ 2 |
| chung.bb@phongkinhte-tranphu.vn | Bùi Bá Chung | Chuyên viên (Tổ 2) |
| thinh.cv@phongkinhte-tranphu.vn | Cao Văn Thịnh | Chuyên viên (Tổ 2) |
| phan.pt@phongkinhte-tranphu.vn | Phạm Tuấn Phan | Chuyên viên |
| diep.tt@phongkinhte-tranphu.vn | Trần Thị Diệp | Chuyên viên |
| hoanh.tq@phongkinhte-tranphu.vn | Tạ Quang Hoành | Chuyên viên |
| tien.dd@phongkinhte-tranphu.vn | Đặng Đức Tiễn | Chuyên viên |

## Ma Trận Quyền Hạn (RBAC)

| Quyền | Trưởng phòng | Phó TP | Trưởng BP | Chuyên viên | Nhân viên |
|-------|:---:|:---:|:---:|:---:|:---:|
| Giao việc toàn phòng | ✓ | - | - | - | - |
| Giao việc bộ phận | ✓ | ✓ | ✓ | - | - |
| Giao việc trong tổ | ✓ | ✓ | ✓ | ✓ | - |
| Xem tất cả task | ✓ | ✓ | - | - | - |
| Duyệt/Xóa task | ✓ | ✓ | ✓ | - | - |
| Quản lý người dùng | ✓ | - | - | - | - |
| Xuất báo cáo CSV | ✓ | ✓ | ✓ | - | - |
| Tiếp nhận UBND | ✓ | ✓ | - | - | - |
| Upload văn bản pháp lý | ✓ | ✓ | ✓ | - | - |
| AI đầy đủ (Hybrid RAG) | ✓ | ✓ | ✓ | - | - |
| AI giới hạn | - | - | - | ✓ | - |

## AI Legal Assistant — Hybrid RAG

Module AI là tâm điểm của hệ thống với pipeline 3 tầng fallback:

```
câu hỏi
    │
    ▼
[1] Detect follow-up? (regex Vietnamese-aware)
    │ Có  → Reuse chunks từ tin nhắn trước (full Điều)
    │ Không ↓
    ▼
[2] retrieveWithArticleExpansion (tầng 1 — ưu tiên cao nhất)
    ├── retrieveHybrid: vector top-30 → BM25 re-rank → 0.6 cosine + 0.4 BM25
    └── Group theo Điều → pull TOÀN BỘ Khoản của top-3 Điều
    │ Fail ↓
[3] retrieveHybrid (tầng 2 — fallback)
    │ Fail ↓
[4] retrieveRelevantChunks (tầng 3 — BM25 legacy)
    │
    ▼
[5] Build multi-turn messages [history × 5 + current]
    ▼
[6] Stream từ AI provider (Gemini → DeepSeek → Anthropic)
```

## Roadmap

- [x] Phase 01: Foundation — schema 15 models, auth, seed 21 users, UI shell
- [x] Phase 02: Task Management — giao việc top-down, Tổ 1/Tổ 2, tiến độ
- [x] Phase 03: UBND, iHanoi, TTHC, lịch công tác, báo cáo CSV/print
- [x] Phase 04: AI Legal Assistant — RAG keyword BM25, multi-provider
- [x] Phase 05: PWA, Docker Compose, Nginx, deploy script
- [x] Phase 06: **Hybrid RAG** (pgvector + BM25 + Article Expansion + Conversation context)
- [x] Phase 06: **PDF Parallel OCR** (Gemini Vision, worker pool 4 batch song song)
- [ ] Phase 07: iHanoi API integration (đang gác lại — cần API key từ UBND TP)
- [ ] Phase 07: Real-time notifications (WebSocket/SSE push)
- [ ] Phase 08: Audit log, 2FA, VBDXP integration

## Tài Liệu Chi Tiết

| Tài liệu | Nội dung |
|----------|---------|
| [docs/project-overview-pdr.md](docs/project-overview-pdr.md) | Yêu cầu dự án, stakeholders, bối cảnh pháp lý, success metrics |
| [docs/codebase-summary.md](docs/codebase-summary.md) | Cấu trúc thư mục, mô tả file, Prisma models, RAG libs mới |
| [docs/code-standards.md](docs/code-standards.md) | TypeScript, naming, RBAC pattern, AI security rules, RAG coding patterns |
| [docs/system-architecture.md](docs/system-architecture.md) | Architecture diagrams, request flows, Hybrid RAG pipeline, multi-provider AI |
| [docs/project-roadmap.md](docs/project-roadmap.md) | Roadmap chi tiết — phases đã xong, backlog, technical debt |

## Liên Hệ

- **Trưởng phòng:** Vũ Văn Tuấn — tuan.vv@phongkinhte-tranphu.vn
- **Hỗ trợ kỹ thuật:** Liên hệ qua email Trưởng phòng

---

Internal use — UBND Xã Trần Phú © 2026
