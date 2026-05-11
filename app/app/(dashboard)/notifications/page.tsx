import Link from "next/link";
import { requireAuth } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { MarkAllReadButton } from "@/components/notification/mark-all-read";
import { formatRelative } from "@/lib/utils";
import { Bell, Check } from "lucide-react";

export default async function NotificationsPage() {
  const user = await requireAuth();
  const items = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const unreadCount = items.filter((n) => !n.isRead).length;

  return (
    <div>
      <PageHeader
        title="Thông báo"
        description={`${unreadCount} thông báo chưa đọc`}
        actions={unreadCount > 0 && <MarkAllReadButton />}
      />

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Bell className="h-12 w-12 mx-auto mb-3 opacity-30" />
            Chưa có thông báo nào
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <Link key={n.id} href={n.link || "#"}>
              <Card className={n.isRead ? "opacity-70" : "border-primary/30 bg-primary/5"}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-3">
                    <div className={n.isRead ? "h-2 w-2 rounded-full bg-muted shrink-0 mt-2" : "h-2 w-2 rounded-full bg-primary shrink-0 mt-2"} />
                    <div className="flex-1">
                      <div className="font-semibold">{n.title}</div>
                      <p className="text-sm text-muted-foreground mt-1">{n.message}</p>
                      <p className="text-xs text-muted-foreground mt-2">{formatRelative(n.createdAt)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
