# Design Guidelines

**Dự án:** App Quản Lý Phòng Kinh Tế Xã Trần Phú
**Cập nhật:** 2026-05-11

---

## Mục lục

1. [Typography](#1-typography)
2. [Color Palette](#2-color-palette)
3. [Layout & Spacing](#3-layout--spacing)
4. [Component Patterns](#4-component-patterns)
5. [Mobile-First](#5-mobile-first)
6. [Vietnamese Terminology](#6-vietnamese-terminology)
7. [Accessibility](#7-accessibility)

---

## 1. Typography

### Fonts

| Font | Dùng cho | Import |
|------|----------|--------|
| **Be Vietnam Pro** | Heading, UI labels | Google Fonts |
| **Noto Sans** (Vietnamese subset) | Body text, long content | Google Fonts |

**Font sizes chuẩn:**
- Base body: `18px` (lớn hơn bình thường để dễ đọc trên mobile)
- Small text: `14px` (captions, badges)
- Heading page: `24px` / `font-semibold`
- Card title: `16px` / `font-medium`

```tsx
// app/layout.tsx
const notoSans = Noto_Sans({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
});
```

### Hierarchy

```
H1 (page title):    text-2xl font-semibold text-gray-900
H2 (section):       text-lg font-medium text-gray-800
Body:               text-base text-gray-700
Caption/meta:       text-sm text-gray-500
Badge text:         text-xs font-medium
```

---

## 2. Color Palette

### Màu chính (Tailwind CSS)

| Vai trò | Class | Hex |
|---------|-------|-----|
| Primary action | `bg-blue-600` | #2563EB |
| Primary hover | `bg-blue-700` | #1D4ED8 |
| Success / Hoàn thành | `bg-green-600` | #16A34A |
| Warning / Sắp hạn | `bg-yellow-500` | #EAB308 |
| Danger / Quá hạn | `bg-red-600` | #DC2626 |
| Neutral / Pending | `bg-gray-400` | #9CA3AF |
| Background | `bg-gray-50` | #F9FAFB |
| Card background | `bg-white` | #FFFFFF |
| Border | `border-gray-200` | #E5E7EB |

### TaskStatus colors

```typescript
const STATUS_COLORS = {
  PENDING:         "bg-gray-100 text-gray-700",
  IN_PROGRESS:     "bg-blue-100 text-blue-700",
  AWAITING_REVIEW: "bg-yellow-100 text-yellow-800",  // Mới — chờ TP duyệt
  COMPLETED:       "bg-green-100 text-green-700",
  OVERDUE:         "bg-red-100 text-red-700",
  CANCELLED:       "bg-gray-100 text-gray-400",
};
```

### Priority colors

```typescript
const PRIORITY_COLORS = {
  KHAN_CAP: "bg-red-600 text-white",     // Khẩn cấp — nổi bật
  CAO:      "bg-orange-500 text-white",  // Cao
  THUONG:   "bg-blue-500 text-white",    // Thường
  THAP:     "bg-gray-400 text-white",    // Thấp
};
```

---

## 3. Layout & Spacing

### Spacing scale (Tailwind)

```
p-4 = 16px   — card padding cơ bản
p-6 = 24px   — page padding desktop
gap-4        — khoảng cách giữa cards
mb-6         — khoảng cách giữa sections
```

### Page structure

```tsx
// Trang chuẩn
<div className="p-4 md:p-6 space-y-6">
  <PageHeader title="Danh sách nhiệm vụ" />
  <FilterBar />
  <div className="space-y-4">
    {items.map(item => <Card key={item.id} />)}
  </div>
</div>
```

### Task detail — 2 column (desktop)

```tsx
// Chi tiết task: main content + right column
<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
  <div className="lg:col-span-2 space-y-6">
    {/* Nội dung chính */}
  </div>
  <div className="space-y-4">
    {/* Right column: Thông tin + TaskNotesPanel */}
    <TaskNotesPanel taskId={task.id} />
  </div>
</div>
```

---

## 4. Component Patterns

### Card-based layout

Tất cả nội dung được bọc trong Card (shadcn/ui):

```tsx
<Card>
  <CardHeader>
    <CardTitle>Tiêu đề</CardTitle>
    <CardDescription>Mô tả phụ</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Nội dung */}
  </CardContent>
  <CardFooter>
    {/* Actions */}
  </CardFooter>
</Card>
```

### Status Badge

```tsx
// Luôn dùng component StatusBadge, không tự viết badge inline
<StatusBadge status={task.status} />

// TaskNote pin indicator
{note.isPinned && (
  <Badge variant="outline" className="text-yellow-600 border-yellow-300">
    Đã ghim
  </Badge>
)}
```

### Dropdown filter

Pattern cho các trang list (tasks, UBND, iHanoi, TTHC):

```tsx
// URL-based filter — đồng bộ qua searchParams
<Select
  value={searchParams.status ?? "all"}
  onValueChange={(v) => router.push(`?status=${v}`)}
>
  <SelectTrigger className="w-[180px]">
    <SelectValue placeholder="Tất cả trạng thái" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">Tất cả</SelectItem>
    <SelectItem value="PENDING">Cần thực hiện</SelectItem>
    <SelectItem value="IN_PROGRESS">Đang xử lý</SelectItem>
    <SelectItem value="AWAITING_REVIEW">Chờ xác nhận</SelectItem>
    <SelectItem value="COMPLETED">Hoàn thành</SelectItem>
    <SelectItem value="OVERDUE">Quá hạn</SelectItem>
  </SelectContent>
</Select>
```

### Action buttons — workflow

```tsx
// Task workflow buttons — hiển thị theo role + status
{task.status === "PENDING" && task.assigneeId === user.id && (
  <Button onClick={() => performTaskAction(task.id, "start")}>
    Bắt đầu
  </Button>
)}

{task.status === "IN_PROGRESS" && task.assigneeId === user.id && (
  <Button onClick={() => performTaskAction(task.id, "submit")} variant="secondary">
    Gửi hoàn thành
  </Button>
)}

{task.status === "AWAITING_REVIEW" && isTopLeader(user.role) && (
  <>
    <Button onClick={() => performTaskAction(task.id, "confirm")} className="bg-green-600">
      Xác nhận hoàn thành
    </Button>
    <Button onClick={() => performTaskAction(task.id, "reject")} variant="outline">
      Yêu cầu làm lại
    </Button>
  </>
)}
```

### AI Confirmation Card

```tsx
// Hiển thị khi AI write tool trả về __pendingAction
<ConfirmationCard
  toolName={pendingAction.toolName}
  preview={pendingAction.preview}
  onConfirm={() => confirmAction(pendingAction)}
  onCancel={() => setPendingAction(null)}
/>
```

---

## 5. Mobile-First

### Navigation

- **Mobile (< md):** Bottom Navigation Bar — 5 items, icon + text nhỏ
- **Desktop (≥ md):** Sidebar bên trái, 280px width

```tsx
<Sidebar className="hidden md:flex" />
<div className="md:pl-72">
  <main className="pb-24 md:pb-6">{children}</main>
</div>
<BottomNav className="md:hidden" />
```

### Touch targets

Tất cả interactive elements phải có touch target tối thiểu 44×44px:

```tsx
// ĐÚNG
<Button className="min-h-[44px] px-4">Cập nhật tiến độ</Button>

// SAI — quá nhỏ cho mobile
<Button size="sm">...</Button>
```

### Font size mobile

Base font 18px thay vì 16px default — cán bộ lớn tuổi, đọc trên điện thoại.

### Offline mode

PWA Service Worker cache danh sách task cho offline viewing. Khi mất mạng, user vẫn xem được dữ liệu cũ.

---

## 6. Vietnamese Terminology

### Chức danh chuẩn (mapping từ Quyết định phân công)

| Thuật ngữ đúng | Không dùng |
|----------------|-----------|
| Trưởng phòng | Team Leader, Manager |
| Phó Trưởng phòng | Deputy, Vice Manager |
| Trưởng bộ phận | Department Head, TBP |
| Chuyên viên | Staff, Officer |
| Nhân viên | Employee |

### Bộ phận

| Thuật ngữ đúng | Viết tắt OK |
|----------------|-----------|
| Bộ phận Tài chính - Kế hoạch | BP TC-KH |
| Bộ phận Nông nghiệp & Môi trường | BP NN-MT |
| Bộ phận Xây dựng & Công thương | BP XD-CT |

### Module labels chuẩn

| Nội dung | Label hiển thị |
|---------|---------------|
| TaskStatus.PENDING | Cần thực hiện |
| TaskStatus.IN_PROGRESS | Đang xử lý |
| TaskStatus.AWAITING_REVIEW | Chờ xác nhận |
| TaskStatus.COMPLETED | Hoàn thành |
| TaskStatus.OVERDUE | Quá hạn |
| TaskStatus.CANCELLED | Đã hủy |
| Priority.KHAN_CAP | Khẩn cấp |
| Priority.CAO | Cao |
| Priority.THUONG | Thường |
| Priority.THAP | Thấp |
| TaskSource.INTERNAL | Nội bộ |
| TaskSource.UBND_DIRECTIVE | Nhiệm vụ UBND |
| TaskSource.IHANOI | Phản ánh iHanoi |

### AI Chat labels

```typescript
// Module AI — không để lộ tên provider
"Trợ lý AI Pháp lý"           // Page title
"Trợ lý AI Phòng Kinh Tế"     // Chat header
"Lời nhắn dành cho bạn"        // TaskNote header cho assignee
"Lời nhắn"                     // TaskNote header cho leader
```

---

## 7. Accessibility

### ARIA labels

```tsx
// Notification badge
<span aria-label={`${unreadCount} thông báo chưa đọc`}>
  {unreadCount}
</span>

// Status badge
<span role="status" aria-label={`Trạng thái: ${STATUS_LABELS[status]}`}>
  <StatusBadge status={status} />
</span>
```

### Form validation feedback

```tsx
// Luôn dùng aria-describedby cho error messages
<Input
  aria-describedby={error ? "title-error" : undefined}
  aria-invalid={!!error}
/>
{error && <p id="title-error" role="alert">{error}</p>}
```

### Color + Icon redundancy

Không dùng chỉ màu sắc để truyền thông tin — luôn kèm icon hoặc text:

```tsx
// ĐÚNG: màu + text
<Badge className="bg-red-100 text-red-700">Quá hạn</Badge>

// SAI: chỉ màu
<div className="w-3 h-3 rounded-full bg-red-500" />
```
