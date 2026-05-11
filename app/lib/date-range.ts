// Utility tính khoảng thời gian từ preset "Hôm nay/Hôm qua/Tuần này/Tháng này/Tùy chỉnh"
// Dùng chung cho mọi component cần lọc theo thời gian

export type DateRangePreset = "today" | "yesterday" | "this-week" | "this-month" | "custom" | "all";

export interface DateRange {
  from: Date;
  to: Date; // exclusive (lt: to)
  label: string;
}

export const DATE_PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: "all", label: "Tất cả thời gian" },
  { value: "today", label: "Hôm nay" },
  { value: "yesterday", label: "Hôm qua" },
  { value: "this-week", label: "Tuần này" },
  { value: "this-month", label: "Tháng này" },
  { value: "custom", label: "Tùy chỉnh" },
];

// VN timezone-aware utilities (UTC+7).
// Server có thể chạy UTC (Docker default), nhưng business logic phải dùng VN time.
// Tránh dùng `getFullYear/getMonth/getDate` (local TZ) — phải dùng UTC + offset 7h.
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  // Lấy "00:00 ngày VN của d" expressed as UTC Date.
  const vnDate = new Date(d.getTime() + VN_OFFSET_MS);
  const startUtcMs = Date.UTC(
    vnDate.getUTCFullYear(),
    vnDate.getUTCMonth(),
    vnDate.getUTCDate()
  );
  return new Date(startUtcMs - VN_OFFSET_MS);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 24 * 60 * 60 * 1000);
}

/** VN-aware: lấy thứ ngày trong tuần (1=Mon..7=Sun) theo VN time */
function vnDayOfWeek(d: Date): number {
  const vn = new Date(d.getTime() + VN_OFFSET_MS);
  const dow = vn.getUTCDay(); // 0=Sun..6=Sat
  return dow === 0 ? 7 : dow;
}

/** VN-aware: lấy ngày 1 của tháng VN của d, expressed as UTC Date */
function vnStartOfMonth(d: Date): Date {
  const vn = new Date(d.getTime() + VN_OFFSET_MS);
  const startUtcMs = Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), 1);
  return new Date(startUtcMs - VN_OFFSET_MS);
}

/** VN-aware: lấy ngày 1 tháng kế tiếp */
function vnStartOfNextMonth(d: Date): Date {
  const vn = new Date(d.getTime() + VN_OFFSET_MS);
  const startUtcMs = Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth() + 1, 1);
  return new Date(startUtcMs - VN_OFFSET_MS);
}

/**
 * Tính từ preset → DateRange. Tuần bắt đầu THỨ HAI theo chuẩn VN.
 * Trả về null nếu là "all" (không lọc).
 */
export function computeDateRange(
  preset: DateRangePreset | string | null | undefined,
  customFrom?: string | null,
  customTo?: string | null
): DateRange | null {
  const now = new Date();
  const today = startOfDay(now);

  switch (preset) {
    case "today":
      return { from: today, to: addDays(today, 1), label: "Hôm nay" };

    case "yesterday":
      return { from: addDays(today, -1), to: today, label: "Hôm qua" };

    case "this-week": {
      // Tuần bắt đầu thứ Hai (chuẩn VN), VN-timezone aware
      const dayOfWeek = vnDayOfWeek(today); // 1=Mon..7=Sun
      const monday = addDays(today, -(dayOfWeek - 1));
      return { from: monday, to: addDays(monday, 7), label: "Tuần này" };
    }

    case "this-month":
      return {
        from: vnStartOfMonth(now),
        to: vnStartOfNextMonth(now),
        label: "Tháng này",
      };

    case "custom":
      if (customFrom && customTo) {
        const from = startOfDay(new Date(customFrom));
        const to = addDays(startOfDay(new Date(customTo)), 1);
        return {
          from,
          to,
          label: `${formatDateShort(from)} - ${formatDateShort(addDays(to, -1))}`,
        };
      }
      return null;

    case "all":
    case null:
    case undefined:
    case "":
    default:
      return null;
  }
}

function formatDateShort(d: Date): string {
  // VN-aware format
  const vn = new Date(d.getTime() + VN_OFFSET_MS);
  return `${vn.getUTCDate().toString().padStart(2, "0")}/${(vn.getUTCMonth() + 1).toString().padStart(2, "0")}`;
}

/**
 * Đọc từ URLSearchParams (server component, search params object).
 * Trả về { range, from, to } cho component sử dụng.
 */
export function parseDateRangeParams(params: {
  range?: string;
  from?: string;
  to?: string;
}): { preset: DateRangePreset; range: DateRange | null } {
  const preset = (params.range as DateRangePreset) || "all";
  const range = computeDateRange(preset, params.from, params.to);
  return { preset, range };
}
