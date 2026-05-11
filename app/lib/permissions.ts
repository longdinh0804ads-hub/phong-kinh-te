import type { Role, Department } from "@prisma/client";

export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  TRUONG_PHONG: "TRUONG_PHONG",
  PHO_TP: "PHO_TP",
  TRUONG_BO_PHAN: "TRUONG_BO_PHAN",
  CHUYEN_VIEN: "CHUYEN_VIEN",
  NHAN_VIEN: "NHAN_VIEN",
} as const;

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Quản trị hệ thống",
  TRUONG_PHONG: "Trưởng phòng",
  PHO_TP: "Phó Trưởng phòng",
  TRUONG_BO_PHAN: "Trưởng bộ phận",
  CHUYEN_VIEN: "Chuyên viên",
  NHAN_VIEN: "Nhân viên",
};

export const ROLE_LEVELS: Record<Role, number> = {
  SUPER_ADMIN: 0,
  TRUONG_PHONG: 1,
  PHO_TP: 2,
  TRUONG_BO_PHAN: 3,
  CHUYEN_VIEN: 4,
  NHAN_VIEN: 5,
};

export const DEPARTMENT_LABELS = {
  BAN_LANH_DAO: "Ban Lãnh đạo",
  TAI_CHINH_KE_HOACH: "Bộ phận Tài chính - Kế hoạch",
  NONG_NGHIEP_MOI_TRUONG: "Bộ phận Nông nghiệp & Môi trường",
  XAY_DUNG_CONG_THUONG: "Bộ phận Xây dựng & Công thương",
} as const;

/**
 * Tất cả permission keys trong hệ thống.
 *
 * Quy tắc scope suffix:
 *   :all  = toàn phòng
 *   :dept = trong bộ phận (department) của user
 *   :team = trong tổ kiểm tra (teamGroupCode) của user
 *   :own  = chỉ liên quan trực tiếp user (assignee/handler/creator = user)
 */
export type Permission =
  // ADMIN (super admin only - tech ops)
  | "admin:settings"     // Quản lý API keys + system settings
  | "admin:users"        // Reset password, lock/unlock, change role
  | "admin:audit"        // Xem audit logs
  | "admin:health"       // Xem health dashboard
  | "admin:maintenance"  // Clear cache, trigger cron, force logout
  // TASK
  | "task:create"
  | "task:assign:all"
  | "task:assign:dept"
  | "task:view:all"
  | "task:view:dept"
  | "task:view:own"
  | "task:approve" // TP/PTP xác nhận hoàn thành
  | "task:delete"
  // REPORT
  | "report:view:all"
  | "report:view:dept"
  | "report:view:own"
  | "report:create"
  | "report:export"
  // USER
  | "user:manage"
  | "user:view:all"
  | "user:view:dept"
  // UBND
  | "ubnd:create"
  | "ubnd:assign"
  | "ubnd:view:all"
  | "ubnd:view:dept"
  | "ubnd:view:own"
  // iHanoi
  | "ihanoi:assign"
  | "ihanoi:handle"
  | "ihanoi:view:all"
  | "ihanoi:view:dept"
  | "ihanoi:view:own"
  // TTHC
  | "tthc:create"
  | "tthc:handle"
  | "tthc:view:all"
  | "tthc:view:dept"
  | "tthc:view:own"
  // AI
  | "ai:full" // dùng đầy đủ (xem all, dùng write tool)
  | "ai:limited" // chỉ xem việc của mình
  // LEGAL DOCS
  | "legal:upload"
  | "legal:manage"
  | "legal:view"
  // SCHEDULE
  | "schedule:manage:all"
  | "schedule:manage:dept"
  | "schedule:manage:own";

export const PERMISSION_MATRIX: Record<Role, Permission[]> = {
  SUPER_ADMIN: [
    // CHỈ quyền admin - KHÔNG có quyền nghiệp vụ (task, ubnd, ...)
    "admin:settings",
    "admin:users",
    "admin:audit",
    "admin:health",
    "admin:maintenance",
  ],
  TRUONG_PHONG: [
    // FULL ADMIN
    "task:create", "task:assign:all", "task:view:all", "task:approve", "task:delete",
    "report:view:all", "report:create", "report:export",
    "user:manage", "user:view:all",
    "ubnd:create", "ubnd:assign", "ubnd:view:all",
    "ihanoi:assign", "ihanoi:view:all",
    "tthc:create", "tthc:view:all",
    "ai:full", "legal:upload", "legal:manage", "legal:view",
    "schedule:manage:all",
  ],
  PHO_TP: [
    // Phó TP: gần như TP, KHÔNG có user:manage, legal:manage, ubnd:create
    "task:create", "task:assign:all", "task:view:all", "task:approve",
    "report:view:all", "report:create", "report:export",
    "user:view:all",
    "ubnd:assign", "ubnd:view:all",
    "ihanoi:assign", "ihanoi:view:all",
    "tthc:create", "tthc:view:all",
    "ai:full", "legal:upload", "legal:view",
    "schedule:manage:all",
  ],
  TRUONG_BO_PHAN: [
    // CHỈ quyền trong bộ phận của mình
    "task:create", "task:assign:dept", "task:view:dept",
    "report:view:dept", "report:create",
    "user:view:dept",
    "ubnd:view:dept",
    "ihanoi:assign", "ihanoi:handle", "ihanoi:view:dept",
    "tthc:create", "tthc:handle", "tthc:view:dept",
    "ai:full", "legal:view",
    "schedule:manage:dept",
  ],
  CHUYEN_VIEN: [
    // Chỉ task của mình - KHÔNG tạo, KHÔNG sửa metadata
    // Workflow assignee (start/report/submit) check riêng trong actions/task.ts theo task.assigneeId
    "task:view:own",
    "report:view:own",
    "ubnd:view:own",
    "ihanoi:handle", "ihanoi:view:own",
    "tthc:handle", "tthc:view:own",
    "ai:full", "legal:view",
    "schedule:manage:own",
  ],
  NHAN_VIEN: [
    // Cấp thấp nhất: chỉ thấy task của mình + lịch cá nhân
    "task:view:own",
    "report:view:own",
    "ubnd:view:own",
    "ai:limited", "legal:view",
    "schedule:manage:own",
  ],
};

// =====================================================
// HELPERS
// =====================================================

export function hasPermission(role: Role, permission: Permission): boolean {
  return PERMISSION_MATRIX[role]?.includes(permission) ?? false;
}

/** Super admin - quản trị kỹ thuật, KHÔNG thuộc nghiệp vụ phòng */
export function isSuperAdmin(role: Role): boolean {
  return role === "SUPER_ADMIN";
}

/** TP hoặc Phó TP - toàn quyền phòng */
export function isTopLeader(role: Role): boolean {
  return role === "TRUONG_PHONG" || role === "PHO_TP";
}

/** Trưởng bộ phận - quyền trong dept */
export function isDeptManager(role: Role): boolean {
  return role === "TRUONG_BO_PHAN";
}

/** Chuyên viên hoặc nhân viên - chỉ quyền cá nhân */
export function isStaff(role: Role): boolean {
  return role === "CHUYEN_VIEN" || role === "NHAN_VIEN";
}

/**
 * DEPRECATED: isLeader() cào bằng TRUONG_BO_PHAN với TP/PTP gây bug scope.
 * Dùng isTopLeader() hoặc isDeptManager() rõ ràng hơn.
 *
 * GIỮ LẠI cho backward-compat tạm thời. Nghĩa: "có quyền lãnh đạo nào đó" =
 * TP / PTP / TRUONG_BO_PHAN. Code mới KHÔNG nên dùng - prefer isTopLeader/isDeptManager.
 */
export function isLeader(role: Role): boolean {
  return ROLE_LEVELS[role] <= 3;
}

/**
 * Lấy danh sách department mà user TRUONG_BO_PHAN quản lý.
 * - Mặc định: [user.department]
 * - Nếu user có managedDepartments không rỗng → dùng list đó (cho phép 1 người quản nhiều BP)
 * - TP/PTP: trả [] với ý nghĩa "không giới hạn" (caller cần check isTopLeader trước)
 * - Staff: trả [] (không quản dept nào)
 */
export function getManagedDepartments(user: {
  role: Role;
  department: Department;
  managedDepartments?: Department[];
}): Department[] {
  if (!isDeptManager(user.role)) return [];
  if (user.managedDepartments && user.managedDepartments.length > 0) {
    return user.managedDepartments;
  }
  return [user.department];
}

export function canViewAllTasks(role: Role): boolean {
  return hasPermission(role, "task:view:all");
}

export function canAssignTask(role: Role): boolean {
  return (
    hasPermission(role, "task:assign:all") ||
    hasPermission(role, "task:assign:dept")
  );
}

export function canManageUsers(role: Role): boolean {
  return hasPermission(role, "user:manage");
}

export function canUseAI(role: Role): boolean {
  return hasPermission(role, "ai:full") || hasPermission(role, "ai:limited");
}

export function isAdmin(role: Role): boolean {
  return role === "TRUONG_PHONG";
}
