// Filter helpers cho user queries.
// SUPER_ADMIN là tài khoản kỹ thuật (quản trị hệ thống), KHÔNG phải thành viên
// phòng → phải ẩn khỏi tất cả query nghiệp vụ (counter, dropdown, list, stats).

import type { Prisma } from "@prisma/client";

/**
 * Filter loại trừ SUPER_ADMIN khỏi user query.
 * Dùng cho mọi query nghiệp vụ: dropdown assignee, count cán bộ phòng, reports, etc.
 *
 * NGOẠI LỆ:
 * - /admin/users (super admin xem all)
 * - Query với role filter explicit (vd `role: { in: ["TRUONG_PHONG", "PHO_TP"] }`)
 *   → đã exclude SUPER_ADMIN tự động.
 */
export const EXCLUDE_SUPER_ADMIN: Prisma.UserWhereInput = {
  role: { not: "SUPER_ADMIN" },
};
