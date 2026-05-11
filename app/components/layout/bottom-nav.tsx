"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ClipboardList, Sparkles, FileText, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@prisma/client";
import { canUseAI, isTopLeader, isDeptManager } from "@/lib/permissions";

interface BadgeMap {
  tasks?: number;
  ubnd?: number;
  ihanoi?: number;
  tthc?: number;
  tasksHasOverdue?: boolean;
}

interface BottomNavProps {
  role: Role;
  badges?: BadgeMap;
}

function formatNum(n: number): string {
  return n > 99 ? "99+" : String(n);
}

export function BottomNav({ role, badges }: BottomNavProps) {
  const pathname = usePathname();

  const items: Array<{
    label: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    badgeKey?: "tasks" | "ubnd" | "ihanoi" | "tthc";
  }> = [
    { label: "Tổng quan", href: "/", icon: LayoutDashboard },
    { label: "Công việc", href: "/tasks", icon: ClipboardList, badgeKey: "tasks" },
    ...(canUseAI(role)
      ? [{ label: "AI", href: "/ai", icon: Sparkles } as const]
      : []),
    // Báo cáo: chỉ TP/PTP/TRUONG_BO_PHAN
    ...(isTopLeader(role) || isDeptManager(role)
      ? [{ label: "Báo cáo", href: "/reports", icon: FileText } as const]
      : []),
    { label: "Khác", href: "/menu", icon: Menu },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t z-40">
      <div className={cn("grid", items.length === 5 ? "grid-cols-5" : "grid-cols-4")}>
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          const count = item.badgeKey && badges ? badges[item.badgeKey] : undefined;
          const showBadge = item.badgeKey && typeof count === "number" && count > 0;
          const hasOverdue = item.badgeKey === "tasks" && badges?.tasksHasOverdue;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1 py-2 text-xs transition-colors",
                active ? "text-primary font-semibold" : "text-muted-foreground"
              )}
            >
              <div className="relative">
                <Icon className="h-5 w-5" />
                {showBadge && (
                  <span
                    className={cn(
                      "absolute -top-1.5 -right-2 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full text-[10px] font-bold flex items-center justify-center shadow-sm",
                      hasOverdue ? "bg-red-500 text-white" : "bg-amber-500 text-white"
                    )}
                  >
                    {formatNum(count as number)}
                  </span>
                )}
              </div>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
