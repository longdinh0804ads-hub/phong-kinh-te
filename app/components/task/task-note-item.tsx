"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Pin, Pencil, Trash2, X, Check, Loader2 } from "lucide-react";
import { cn, formatRelative } from "@/lib/utils";
import { ROLE_LABELS } from "@/lib/permissions";
import {
  updateTaskNote,
  deleteTaskNote,
  toggleTaskNotePin,
} from "@/actions/task-note";
import type { Role } from "@prisma/client";

export interface TaskNoteItemData {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
  authorPosition: string;
  authorRole: Role;
  isPinned: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface Props {
  note: TaskNoteItemData;
  /** ID user hiện tại (để check author quyền sửa/xóa) */
  currentUserId: string;
  /** Role user hiện tại (để check quyền ghim, xóa note người khác) */
  currentUserRole: Role;
}

export function TaskNoteItem({ note, currentUserId, currentUserRole }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(note.content);
  const [error, setError] = useState<string | null>(null);

  const isAuthor = note.authorId === currentUserId;
  const isTP = currentUserRole === "TRUONG_PHONG";
  const canEdit = isAuthor;
  const canDelete = isAuthor || isTP;
  const canPin = isTP;

  function saveEdit() {
    if (editContent.trim().length < 2) return;
    setError(null);
    startTransition(async () => {
      const r = await updateTaskNote({ id: note.id, content: editContent.trim() });
      if (r.error) setError(r.error);
      else {
        setEditing(false);
        router.refresh();
      }
    });
  }

  function handleDelete() {
    if (!confirm("Xóa lời nhắn này?")) return;
    startTransition(async () => {
      const r = await deleteTaskNote(note.id);
      if (r.error) setError(r.error);
      else router.refresh();
    });
  }

  function handlePin() {
    startTransition(async () => {
      const r = await toggleTaskNotePin(note.id);
      if (r.error) setError(r.error);
      else router.refresh();
    });
  }

  const created = typeof note.createdAt === "string" ? new Date(note.createdAt) : note.createdAt;
  const updated = typeof note.updatedAt === "string" ? new Date(note.updatedAt) : note.updatedAt;
  const wasEdited = updated.getTime() - created.getTime() > 1000;

  return (
    <div
      className={cn(
        "rounded-lg border p-3 text-sm",
        note.isPinned
          ? "border-amber-300 bg-amber-50/60 dark:bg-amber-950/20"
          : "border-border bg-card"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            {note.isPinned && (
              <Pin className="h-3 w-3 text-amber-600 shrink-0" />
            )}
            <span className="font-semibold text-xs text-foreground">
              {note.authorPosition} {note.authorName}
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {formatRelative(created)}
            {wasEdited && " · đã sửa"}
          </div>
        </div>

        {!editing && (canEdit || canDelete || canPin) && (
          <div className="flex items-center gap-0.5 shrink-0">
            {canPin && (
              <button
                type="button"
                onClick={handlePin}
                disabled={isPending}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-amber-600 transition-colors"
                title={note.isPinned ? "Bỏ ghim" : "Ghim"}
              >
                <Pin className={cn("h-3.5 w-3.5", note.isPinned && "text-amber-600 fill-amber-600")} />
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                disabled={isPending}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Sửa"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                title="Xóa"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      {editing ? (
        <div className="space-y-2">
          <Textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={3}
            maxLength={2000}
            disabled={isPending}
            className="text-sm"
          />
          <div className="flex justify-end gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setEditContent(note.content);
                setError(null);
              }}
              disabled={isPending}
              className="h-7 px-2"
            >
              <X className="h-3 w-3" />
              Hủy
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={saveEdit}
              disabled={isPending || editContent.trim().length < 2}
              className="h-7 px-2"
            >
              {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Lưu
            </Button>
          </div>
        </div>
      ) : (
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
          {note.content}
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-destructive bg-destructive/10 rounded px-2 py-1">
          {error}
        </p>
      )}
    </div>
  );
}
