import Link from "next/link";
import { requireAuth } from "@/lib/session";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import {
  CalendarDays, FileText, Building, Inbox, Library, Users, Settings, User as UserIcon, Bell,
} from "lucide-react";
import { canManageUsers, canUseAI, isLeader } from "@/lib/permissions";

export default async function MenuPage() {
  const user = await requireAuth();

  const items = [
    { href: "/schedule", icon: CalendarDays, label: "Lịch công tác" },
    { href: "/ubnd", icon: Building, label: "Nhiệm vụ UBND" },
    { href: "/ihanoi", icon: Inbox, label: "Phản ánh iHanoi" },
    { href: "/tthc", icon: FileText, label: "Hồ sơ TTHC" },
    isLeader(user.role) && { href: "/reports", icon: FileText, label: "Báo cáo" },
    { href: "/legal", icon: Library, label: "Văn bản pháp lý" },
    canManageUsers(user.role) && { href: "/users", icon: Users, label: "Quản lý cán bộ" },
    { href: "/notifications", icon: Bell, label: "Thông báo" },
    { href: "/profile", icon: UserIcon, label: "Hồ sơ cá nhân" },
    { href: "/settings", icon: Settings, label: "Cài đặt" },
  ].filter(Boolean) as Array<{ href: string; icon: any; label: string }>;

  return (
    <div>
      <PageHeader title="Menu" />
      <div className="grid grid-cols-2 gap-3">
        {items.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="pt-6 pb-6 text-center">
                <item.icon className="h-8 w-8 text-primary mx-auto mb-2" />
                <div className="text-sm font-medium">{item.label}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
