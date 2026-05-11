# Design Guidelines — App PKT Xã Trần Phú

**Cập nhật:** 2026-05-11

---

## 1. Nguyên tắc thiết kế

- **Mobile-first:** Android 11+, màn hình 5", dùng tay một tay OK
- **Đơn giản trước:** Cán bộ xã không phải người dùng tech, ưu tiên rõ ràng hơn đẹp
- **Tiếng Việt hoàn toàn:** Labels, messages, errors đều bằng tiếng Việt
- **Thông báo rõ ràng:** Success/error phải nổi bật, không mờ nhạt

---

## 2. Typography

| Element | Font | Size | Weight |
|---------|------|------|--------|
| Body text | Noto Sans | 18px | 400 |
| Heading H1 | Noto Sans | 24px | 600 |
| Heading H2 | Noto Sans | 20px | 600 |
| Label | Noto Sans | 16px | 500 |
| Small/caption | Noto Sans | 14px | 400 |

Noto Sans được chọn vì: hỗ trợ Unicode tiếng Việt tốt, dễ đọc trên màn hình nhỏ, free.

---

## 3. Color System (shadcn/ui tokens)

Dùng CSS variables của shadcn/ui. Không hardcode màu hex trực tiếp trong component.

```css
/* Dùng */
bg-background, text-foreground
bg-primary, text-primary-foreground
bg-destructive, text-destructive-foreground
bg-muted, text-muted-foreground
border, ring
```

### Status colors (Task)

| Status | Color token | Ý nghĩa |
|--------|------------|---------|
| PENDING | `text-muted-foreground` | Chờ bắt đầu |
| IN_PROGRESS | `text-blue-600` | Đang làm |
| AWAITING_REVIEW | `text-yellow-600` | Chờ TP xác nhận |
| COMPLETED | `text-green-600` | Hoàn thành |
| OVERDUE | `text-destructive` | Quá hạn |
| CANCELLED | `text-muted-foreground line-through` | Hủy |

### Priority colors

| Priority | Color |
|----------|-------|
| KHAN_CAP | `text-red-600 font-bold` |
| CAO | `text-orange-500` |
| THUONG | `text-foreground` |
| THAP | `text-muted-foreground` |

---

## 4. Component library

Dùng **shadcn/ui** components. Không tự viết UI primitives từ đầu.

```bash
# Thêm component mới
npx shadcn@latest add <component-name>
```

Component đã có: Button, Card, Dialog, Input, Select, Table, Toast, Tabs, Badge, Popover, Checkbox, Progress, Avatar, Label, Dropdown Menu, Calendar (react-day-picker).

---

## 5. Layout

### Sidebar navigation

- Desktop: sidebar cố định bên trái, width 240px
- Mobile: sidebar ẩn, hamburger menu
- Active item: `bg-primary/10 text-primary font-medium`
- Badge số trên sidebar item (task pending, notification unread)

### Page layout

```tsx
<div className="flex h-screen">
  <Sidebar />
  <main className="flex-1 overflow-y-auto p-4 md:p-6">
    <PageHeader title="..." />
    {/* content */}
  </main>
</div>
```

---

## 6. Security UI Patterns

### Login form

- Hiển thị lỗi lockout rõ ràng: "Tài khoản bị khóa đến HH:mm DD/MM/YYYY"
- Turnstile widget xuất hiện tự động sau 2 lần fail (không hiện từ đầu)
- Password field: toggle show/hide
- Submit button disabled khi đang processing

### 2FA setup (`/settings/security`)

- QR code hiển thị kích thước đủ lớn (min 200×200px) cho điện thoại scan
- Backup codes: hiển thị dạng grid 2×4, có nút copy và download
- Cảnh báo rõ: "Lưu backup codes, mỗi code chỉ dùng được 1 lần"
- Confirm code trước khi enable 2FA (để chắc app hoạt động)

### 2FA challenge (`/login/2fa`)

- Input 6 chữ số, auto-focus, accept paste
- Link "Dùng backup code" ở dưới (mờ hơn)
- Không hiện retry count (tránh leak)

### Force change password (`/change-password`)

- Password strength indicator (4 mức: Yếu / Trung bình / Mạnh / Rất mạnh)
- Checklist requirements hiển thị real-time:
  - [ ] Ít nhất 12 ký tự
  - [ ] Chữ hoa
  - [ ] Chữ thường
  - [ ] Số
  - [ ] Ký tự đặc biệt
- Không cho phép thoát trang (trừ logout)

### Security dashboard (`/settings/security`)

4 tab:
1. **2FA** — status, setup/disable button
2. **Thiết bị** — danh sách TrustedDevice, nút revoke
3. **Phiên đăng nhập** — sessions active, nút revoke
4. **Lịch sử** — SecurityEvent log (thời gian, loại, IP, thiết bị)

---

## 7. Form patterns

### Error messages

```tsx
// Dùng FormMessage của shadcn
<FormField
  control={form.control}
  name="password"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Mật khẩu</FormLabel>
      <FormControl>
        <Input type="password" {...field} />
      </FormControl>
      <FormMessage />  {/* Tự hiện error từ Zod */}
    </FormItem>
  )}
/>
```

### Submit state

```tsx
const [isPending, startTransition] = useTransition();

<Button type="submit" disabled={isPending}>
  {isPending ? "Đang xử lý..." : "Đăng nhập"}
</Button>
```

### Toast notifications

```tsx
import { toast } from "@/components/ui/use-toast";

// Success
toast({ title: "Thành công", description: "Task đã được tạo" });

// Error
toast({ title: "Lỗi", description: "Không có quyền", variant: "destructive" });
```

---

## 8. Table patterns

Dùng cho danh sách task, user, TTHC, iHanoi:

- Column header: tiếng Việt, sortable khi cần
- Row actions: DropdownMenu (3 dots) ở cột cuối
- Pagination: hiển thị "Hiển thị X-Y của Z mục"
- Empty state: icon + text "Chưa có dữ liệu"
- Loading: skeleton rows

---

## 9. Mobile-specific

- Touch targets: min 44×44px
- Bottom navigation (optional) cho mobile thay sidebar
- Swipe gesture: không dùng (tránh conflict scroll)
- Input: `inputMode="numeric"` cho số điện thoại, mã 2FA
- Font size: không nhỏ hơn 16px (tránh zoom trên iOS)

---

## 10. Accessibility

- Mọi button/input phải có `aria-label` nếu không có text rõ
- Color contrast: WCAG AA minimum (4.5:1 cho body text)
- Focus visible: không xóa outline mặc định
- Error messages: liên kết với input qua `aria-describedby`
