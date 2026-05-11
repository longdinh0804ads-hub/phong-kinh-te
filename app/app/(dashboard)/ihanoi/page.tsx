import Link from "next/link";
import { requireAuth } from "@/lib/session";
import { getIHanoiList } from "@/actions/ihanoi";
import { hasPermission } from "@/lib/permissions";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/task/status-badge";
import { formatDate, isOverdue } from "@/lib/utils";
import { Plus, Calendar, User, Inbox } from "lucide-react";

export default async function IHanoiPage() {
  const user = await requireAuth();
  const items = await getIHanoiList();

  return (
    <div>
      <PageHeader
        title="Phản ánh iHanoi"
        description="Theo dõi và xử lý các phản ánh từ ứng dụng iHanoi"
        actions={
          hasPermission(user.role, "ihanoi:assign") && (
            <Link href="/ihanoi/new">
              <Button><Plus className="h-4 w-4" /> Tiếp nhận phản ánh</Button>
            </Link>
          )
        }
      />

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Inbox className="h-12 w-12 mx-auto mb-3 opacity-30" />
            Chưa có phản ánh nào
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((c) => (
            <Link key={c.id} href={`/ihanoi/${c.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={c.status} />
                      <Badge variant="outline">{c.ticketCode}</Badge>
                    </div>
                  </div>
                  <p className="text-sm line-clamp-2 mb-2">{c.content}</p>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(c.receivedDate)}
                    </span>
                    {c.citizenName && (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {c.citizenName}
                      </span>
                    )}
                    {c.assignee && <span>Phụ trách: {c.assignee.name}</span>}
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
