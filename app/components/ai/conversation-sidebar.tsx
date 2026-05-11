"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  MessageSquare,
  Pin,
  PinOff,
  Trash2,
  Loader2,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/utils";
import {
  togglePinConversation,
  deleteConversation,
  getConversations,
} from "@/actions/conversation";

export interface ConversationSummary {
  id: string;
  title: string | null;
  isPinned: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  _count: { messages: number };
}

interface Props {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  onListChange: (next: ConversationSummary[]) => void;
}

export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onListChange,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState<ConversationSummary | null>(null);

  function startNewChat() {
    onSelect(null);
  }

  async function refreshList() {
    const next = await getConversations();
    onListChange(next as ConversationSummary[]);
  }

  function togglePin(id: string) {
    startTransition(async () => {
      await togglePinConversation(id);
      await refreshList();
    });
  }

  function handleDelete() {
    if (!confirmDelete) return;
    startTransition(async () => {
      await deleteConversation(confirmDelete.id);
      // Nếu đang ở conv vừa xóa, chuyển về new chat
      if (activeId === confirmDelete.id) onSelect(null);
      setConfirmDelete(null);
      await refreshList();
    });
  }

  // Group: Hôm nay / Hôm qua / 7 ngày qua
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const groups = {
    pinned: [] as ConversationSummary[],
    today: [] as ConversationSummary[],
    yesterday: [] as ConversationSummary[],
    older: [] as ConversationSummary[],
  };

  for (const c of conversations) {
    if (c.isPinned) {
      groups.pinned.push(c);
    } else {
      const d = new Date(c.updatedAt);
      if (d >= today) groups.today.push(c);
      else if (d >= yesterday) groups.yesterday.push(c);
      else groups.older.push(c);
    }
  }

  return (
    <>
      <aside className="flex flex-col h-full bg-card border rounded-lg overflow-hidden">
        <div className="p-3 border-b">
          <Button onClick={startNewChat} className="w-full" size="sm">
            <Plus className="h-4 w-4" />
            Hội thoại mới
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              <MessageSquare className="h-10 w-10 mx-auto opacity-30 mb-2" />
              <p className="text-sm">Chưa có hội thoại nào</p>
            </div>
          ) : (
            <div className="p-2 space-y-3">
              {groups.pinned.length > 0 && (
                <ConvGroup
                  title="📌 Ghim"
                  items={groups.pinned}
                  activeId={activeId}
                  onSelect={onSelect}
                  onTogglePin={togglePin}
                  onAskDelete={setConfirmDelete}
                  isPending={isPending}
                />
              )}
              {groups.today.length > 0 && (
                <ConvGroup
                  title="Hôm nay"
                  items={groups.today}
                  activeId={activeId}
                  onSelect={onSelect}
                  onTogglePin={togglePin}
                  onAskDelete={setConfirmDelete}
                  isPending={isPending}
                />
              )}
              {groups.yesterday.length > 0 && (
                <ConvGroup
                  title="Hôm qua"
                  items={groups.yesterday}
                  activeId={activeId}
                  onSelect={onSelect}
                  onTogglePin={togglePin}
                  onAskDelete={setConfirmDelete}
                  isPending={isPending}
                />
              )}
              {groups.older.length > 0 && (
                <ConvGroup
                  title="7 ngày qua"
                  items={groups.older}
                  activeId={activeId}
                  onSelect={onSelect}
                  onTogglePin={togglePin}
                  onAskDelete={setConfirmDelete}
                  isPending={isPending}
                />
              )}
            </div>
          )}
        </div>

        <div className="p-3 border-t bg-muted/30 text-xs text-muted-foreground flex items-center gap-1.5">
          <Clock className="h-3 w-3" />
          Tự động xóa sau 7 ngày (trừ hội thoại đã ghim)
        </div>
      </aside>

      {/* Delete confirmation */}
      <Dialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <DialogTitle>Xóa hội thoại?</DialogTitle>
                <DialogDescription>Hành động này không thể hoàn tác</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <p className="text-sm">
            Bạn sắp xóa: <span className="font-medium">{confirmDelete?.title}</span>
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)} disabled={isPending}>
              Hủy
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Xóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ConvGroup({
  title,
  items,
  activeId,
  onSelect,
  onTogglePin,
  onAskDelete,
  isPending,
}: {
  title: string;
  items: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onTogglePin: (id: string) => void;
  onAskDelete: (c: ConversationSummary) => void;
  isPending: boolean;
}) {
  return (
    <div>
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1.5">
        {title}
      </div>
      <div className="space-y-0.5">
        {items.map((c) => (
          <ConvItem
            key={c.id}
            conv={c}
            active={activeId === c.id}
            onSelect={onSelect}
            onTogglePin={onTogglePin}
            onAskDelete={onAskDelete}
            isPending={isPending}
          />
        ))}
      </div>
    </div>
  );
}

function ConvItem({
  conv,
  active,
  onSelect,
  onTogglePin,
  onAskDelete,
  isPending,
}: {
  conv: ConversationSummary;
  active: boolean;
  onSelect: (id: string) => void;
  onTogglePin: (id: string) => void;
  onAskDelete: (c: ConversationSummary) => void;
  isPending: boolean;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer transition-colors",
        active ? "bg-primary/10 text-primary" : "hover:bg-accent"
      )}
      onClick={() => onSelect(conv.id)}
    >
      <MessageSquare className="h-4 w-4 shrink-0 opacity-60" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{conv.title || "Hội thoại"}</div>
        <div className="text-xs text-muted-foreground">
          {conv._count.messages} tin · {formatRelative(conv.updatedAt)}
        </div>
      </div>
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin(conv.id);
          }}
          disabled={isPending}
          className="p-1 rounded hover:bg-background"
          title={conv.isPinned ? "Bỏ ghim" : "Ghim hội thoại"}
        >
          {conv.isPinned ? (
            <PinOff className="h-3.5 w-3.5" />
          ) : (
            <Pin className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAskDelete(conv);
          }}
          className="p-1 rounded hover:bg-background hover:text-destructive"
          title="Xóa hội thoại"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
