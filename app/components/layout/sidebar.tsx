"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
import {
  LayoutDashboard,
  ClipboardList,
  CalendarDays,
  FileText,
  Building,
  Users,
  Sparkles,
  Library,
  Inbox,
  Settings,
  Building2,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@prisma/client";
import {
  canManageUsers,
  canUseAI,
  hasPermission,
  isTopLeader,
  isDeptManager,
} from "@/lib/permissions";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: Role[];
  show?: (role: Role) => boolean;
  /** Key trong SidebarBadges để lấy số count */
  badgeKey?: "tasks" | "ubnd" | "ihanoi" | "tthc";
}

const NAV_ITEMS: NavItem[] = [
  { label: "Tổng quan", href: "/", icon: LayoutDashboard },
  { label: "Công việc", href: "/tasks", icon: ClipboardList, badgeKey: "tasks" },
  { label: "Lịch công tác", href: "/schedule", icon: CalendarDays },
  // Document Intake AI: TP/PTP/TBP/Admin tiếp nhận văn bản đến → AI tự phân loại
  {
    label: "Tiếp nhận văn bản (AI)",
    href: "/documents/intake",
    icon: Inbox,
    show: (r) => isTopLeader(r) || isDeptManager(r) || r === "SUPER_ADMIN",
  },
  // Speech Writer AI: TP/PTP/TBP/Admin soạn bài phát biểu
  {
    label: "Soạn bài phát biểu (AI)",
    href: "/documents/speech-writer",
    icon: FileText,
    show: (r) => isTopLeader(r) || isDeptManager(r) || r === "SUPER_ADMIN",
  },
  // UBND: NHAN_VIEN xem được "own" - vẫn hiện menu để NV biết mục giao cho mình
  {
    label: "Nhiệm vụ UBND",
    href: "/ubnd",
    icon: Building,
    badgeKey: "ubnd",
    show: (r) =>
      hasPermission(r, "ubnd:view:all") ||
      hasPermission(r, "ubnd:view:dept") ||
      hasPermission(r, "ubnd:view:own"),
  },
  // iHanoi: ẩn cho NHAN_VIEN
  {
    label: "Phản ánh iHanoi",
    href: "/ihanoi",
    icon: Inbox,
    badgeKey: "ihanoi",
    show: (r) =>
      hasPermission(r, "ihanoi:view:all") ||
      hasPermission(r, "ihanoi:view:dept") ||
      hasPermission(r, "ihanoi:view:own"),
  },
  // TTHC: ẩn cho NHAN_VIEN
  {
    label: "Hồ sơ TTHC",
    href: "/tthc",
    icon: FileText,
    badgeKey: "tthc",
    show: (r) =>
      hasPermission(r, "tthc:view:all") ||
      hasPermission(r, "tthc:view:dept") ||
      hasPermission(r, "tthc:view:own"),
  },
  // Thi đua: tất cả role xem được (gamification - cán bộ xem rank của mình)
  {
    label: "Thi đua",
    href: "/thi-dua",
    icon: Trophy,
    show: (r) => r !== "SUPER_ADMIN",
  },
  // Báo cáo: chỉ TP/PTP/TRUONG_BO_PHAN
  {
    label: "Báo cáo",
    href: "/reports",
    icon: FileText,
    show: (r) => isTopLeader(r) || isDeptManager(r),
  },
  // Trợ lý AI: tất cả role được dùng (NHAN_VIEN có ai:limited)
  { label: "Trợ lý AI", href: "/ai", icon: Sparkles, show: canUseAI },
  // Văn bản pháp lý: tất cả role có legal:view
  {
    label: "Văn bản pháp lý",
    href: "/legal",
    icon: Library,
    show: (r) => hasPermission(r, "legal:view"),
  },
  // Quản lý cán bộ: TP (manage) + TRUONG_BO_PHAN/PTP (view dept hoặc all)
  {
    label: "Quản lý cán bộ",
    href: "/users",
    icon: Users,
    show: (r) =>
      canManageUsers(r) ||
      hasPermission(r, "user:view:all") ||
      hasPermission(r, "user:view:dept"),
  },
];

interface BadgeMap {
  tasks?: number;
  ubnd?: number;
  ihanoi?: number;
  tthc?: number;
  tasksHasOverdue?: boolean;
}

interface SidebarProps {
  role: Role;
  userName: string;
  position: string;
  image?: string | null;
  badges?: BadgeMap;
}

function badgeColorClass(key: "tasks" | "ubnd" | "ihanoi" | "tthc", hasOverdue: boolean, active: boolean) {
  if (active) {
    return "bg-primary-foreground/25 text-primary-foreground";
  }
  if (key === "tasks") {
    return hasOverdue ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800";
  }
  if (key === "ubnd") return "bg-amber-100 text-amber-800";
  if (key === "ihanoi") return "bg-blue-100 text-blue-700";
  if (key === "tthc") return "bg-blue-100 text-blue-700";
  return "bg-muted text-foreground";
}

function formatNum(n: number): string {
  return n > 99 ? "99+" : String(n);
}

export function Sidebar({ role, userName, position, image, badges }: SidebarProps) {
  const pathname = usePathname();

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.show) return item.show(role);
    if (item.roles) return item.roles.includes(role);
    return true;
  });

  return (
    <aside className="hidden md:flex md:flex-col md:w-72 md:border-r md:bg-card md:fixed md:h-screen">
      <div className="flex items-center gap-3 px-6 py-5 border-b">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Building2 className="h-6 w-6 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="font-bold text-base truncate">Phòng Kinh Tế</div>
          <div className="text-xs text-muted-foreground truncate">Xã Trần Phú - Hà Nội</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <ul className="space-y-1">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            const count = item.badgeKey && badges ? badges[item.badgeKey] : undefined;
            const showBadge = item.badgeKey && typeof count === "number" && count > 0;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-foreground/75 hover:bg-accent hover:text-foreground"
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="truncate flex-1">{item.label}</span>
                  {showBadge && item.badgeKey && (
                    <span
                      className={cn(
                        "inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[11px] font-semibold shrink-0",
                        badgeColorClass(
                          item.badgeKey,
                          !!badges?.tasksHasOverdue,
                          active
                        )
                      )}
                    >
                      {formatNum(count as number)}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t px-4 py-3">
        <Link
          href="/settings"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <Settings className="h-4 w-4" />
          Cài đặt
        </Link>
        <Link href="/profile" className="mt-2 flex items-center gap-2 group" title="Hồ sơ cá nhân">
          <Avatar className="h-8 w-8 shrink-0">
            {image && <AvatarImage src={image} alt={userName} />}
            <AvatarFallback className="text-[10px]">{getInitials(userName)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0 text-xs text-muted-foreground group-hover:text-foreground transition-colors">
            <div className="font-medium text-foreground truncate">{userName}</div>
            <div className="truncate">{position}</div>
          </div>
        </Link>
      </div>
    </aside>
  );
}
