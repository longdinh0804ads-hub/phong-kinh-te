import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAuth } from "@/lib/session";
import { isSuperAdmin } from "@/lib/permissions";
import {
  Shield,
  Key,
  Users,
  Activity,
  History,
  Wrench,
  LogOut,
  FileSignature,
} from "lucide-react";
import { LogoutButton } from "@/components/admin/logout-button";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuth();
  if (!isSuperAdmin(user.role)) {
    // User nghiệp vụ vô tình truy cập /admin → redirect về dashboard
    redirect("/");
  }

  const navItems = [
    { href: "/admin", label: "Tổng quan", icon: Activity },
    { href: "/admin/api-keys", label: "API Keys", icon: Key },
    { href: "/admin/users", label: "Tài khoản", icon: Users },
    { href: "/admin/pgv", label: "Phiếu giao việc", icon: FileSignature },
    { href: "/admin/audit", label: "Lịch sử", icon: History },
    { href: "/admin/maintenance", label: "Bảo trì", icon: Wrench },
  ];

  return (
    <div className="min-h-screen bg-muted/30">
      <aside className="fixed top-0 left-0 bottom-0 w-64 bg-slate-900 text-slate-100 flex flex-col">
        <div className="px-5 py-5 border-b border-slate-800 flex items-center gap-2">
          <Shield className="h-6 w-6 text-amber-400 shrink-0" />
          <div className="min-w-0">
            <div className="font-bold text-sm">Quản trị hệ thống</div>
            <div className="text-xs text-slate-400 truncate">Phòng Kinh Tế</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-slate-200 hover:bg-slate-800 transition-colors"
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="px-3 py-3 border-t border-slate-800">
          <div className="text-xs text-slate-400 mb-2 px-2 truncate">
            {user.name} · {user.email}
          </div>
          <LogoutButton />
        </div>
      </aside>

      <main className="ml-64 p-6">{children}</main>
    </div>
  );
}
