"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Check, CheckCheck, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getNotifications, markAsRead, markAllAsRead } from "@/actions/notification";
import { formatRelative } from "@/lib/utils";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
}

interface NotificationPopoverProps {
  /** Server-side initial count để hiển thị badge ngay khi page load */
  initialUnreadCount: number;
}

const TYPE_ICON: Record<string, string> = {
  TASK_ASSIGNED: "📋",
  TASK_OVERDUE: "⚠️",
  REPORT_DUE: "📊",
  UBND_NEW: "🏛️",
  IHANOI_NEW: "📨",
  // AI risk alerts (Phase 3)
  RISK_OVERDUE: "⚠️",
  RISK_DEADLINE_SOON: "⏰",
  RISK_STALE_PENDING: "🐢",
  RISK_UBND_DEADLINE: "🏛️",
  RISK_OVERLOAD: "📊",
  RISK_NO_REPORT: "📝",
  RISK_AWAITING_REVIEW: "⏳",
  TASK_NOTE: "💬",
};

const ITEMS_LIMIT = 8;

export function NotificationPopover({ initialUnreadCount }: NotificationPopoverProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Sync với prop khi server data thay đổi (sau router.refresh)
  useEffect(() => {
    setUnreadCount(initialUnreadCount);
  }, [initialUnreadCount]);

  async function loadNotifications() {
    setLoading(true);
    try {
      const data = await getNotifications(false);
      setItems(data.slice(0, ITEMS_LIMIT) as NotificationItem[]);
    } catch (e) {
      console.error("Load notifications failed:", e);
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && items === null) loadNotifications();
  }

  function handleItemClick(item: NotificationItem) {
    // Mark as read async (không block navigate)
    if (!item.isRead) {
      startTransition(async () => {
        await markAsRead(item.id);
        setItems((prev) =>
          prev ? prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)) : null
        );
        setUnreadCount((c) => Math.max(0, c - 1));
        router.refresh();
      });
    }
    if (item.link) {
      router.push(item.link);
      setOpen(false);
    }
  }

  function handleMarkAllRead() {
    startTransition(async () => {
      await markAllAsRead();
      setItems((prev) =>
        prev ? prev.map((n) => ({ ...n, isRead: true })) : null
      );
      setUnreadCount(0);
      router.refresh();
    });
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Thông báo">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge variant="destructive" className="absolute -top-1 -right-1 h-5 min-w-5 px-1 text-[10px]">
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[min(95vw,400px)] p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm">Thông báo</h3>
            {unreadCount > 0 && (
              <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                {unreadCount} mới
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={isPending}
              className="text-xs text-primary hover:underline inline-flex items-center gap-1 disabled:opacity-50"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Đánh dấu đã đọc
            </button>
          )}
        </div>

        {/* List */}
        <div className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              Đang tải...
            </div>
          ) : items && items.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
              Không có thông báo nào
            </div>
          ) : (
            items?.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleItemClick(item)}
                className={cn(
                  "w-full text-left px-4 py-3 hover:bg-accent transition-colors border-b last:border-b-0 flex gap-3",
                  !item.isRead && "bg-blue-50/50 hover:bg-blue-100/50"
                )}
              >
                <div className="text-xl shrink-0" aria-hidden>
                  {TYPE_ICON[item.type] || "🔔"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className={cn("text-sm font-medium line-clamp-1", !item.isRead && "font-semibold")}>
                      {item.title}
                    </div>
                    {!item.isRead && (
                      <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0 mt-1.5" aria-label="Chưa đọc" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                    {item.message}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {formatRelative(new Date(item.createdAt))}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-4 py-2.5">
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="text-xs text-primary hover:underline block text-center"
          >
            Xem tất cả thông báo
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
