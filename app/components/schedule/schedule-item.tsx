"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { deleteSchedule } from "@/actions/schedule";
import { formatDateTime } from "@/lib/utils";
import { Calendar, MapPin, User, Trash2 } from "lucide-react";

interface Item {
  id: string;
  title: string;
  description: string | null;
  scheduleDate: Date | string;
  endDate: Date | string | null;
  location: string | null;
  user: { id: string; name: string; position: string };
}

export function ScheduleItem({ item }: { item: Item }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function remove() {
    if (!confirm("Xóa lịch này?")) return;
    startTransition(async () => {
      await deleteSchedule(item.id);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <h4 className="font-semibold">{item.title}</h4>
            {item.description && <p className="text-sm text-muted-foreground mt-1">{item.description}</p>}
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-2">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDateTime(item.scheduleDate)}
              </span>
              {item.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {item.location}
                </span>
              )}
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {item.user.name}
              </span>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={remove} disabled={isPending}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
