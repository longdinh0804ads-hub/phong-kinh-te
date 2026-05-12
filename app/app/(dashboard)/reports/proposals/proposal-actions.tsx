"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { approveProposal, rejectProposal } from "@/actions/proposals";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, X, Edit3 } from "lucide-react";

interface Props {
  proposalId: string;
  initialNote: string;
}

export function ProposalActions({ proposalId, initialNote }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(initialNote);
  const [reviewComment, setReviewComment] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    setLoading(true);
    setError(null);
    const r = await approveProposal({
      proposalId,
      finalNote: editing ? note : undefined,
      reviewComment: reviewComment || undefined,
    });
    if (r.ok) router.refresh();
    else setError(r.error || "Lỗi không xác định");
    setLoading(false);
  }

  async function handleReject() {
    if (!rejectReason.trim()) {
      setError("Vui lòng nhập lý do từ chối");
      return;
    }
    setLoading(true);
    setError(null);
    const r = await rejectProposal({ proposalId, reason: rejectReason });
    if (r.ok) router.refresh();
    else setError(r.error || "Lỗi không xác định");
    setLoading(false);
  }

  if (rejecting) {
    return (
      <div className="space-y-2 border-t pt-3">
        <label className="text-sm font-medium">Lý do từ chối:</label>
        <textarea
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          rows={2}
          className="w-full text-sm rounded border border-input bg-background px-3 py-2"
          placeholder="VD: Cán bộ đang nghỉ phép, chưa cần nhắc..."
        />
        {error && <div className="text-xs text-destructive">{error}</div>}
        <div className="flex gap-2 justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setRejecting(false);
              setError(null);
            }}
            disabled={loading}
          >
            Hủy
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleReject}
            disabled={loading || !rejectReason.trim()}
          >
            {loading && <Loader2 className="h-3 w-3 animate-spin" />}
            Xác nhận từ chối
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 border-t pt-3">
      {editing && (
        <>
          <label className="text-sm font-medium">Chỉnh sửa nội dung nhắc nhở:</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={6}
            className="w-full text-sm rounded border border-input bg-background px-3 py-2 leading-relaxed"
          />
        </>
      )}

      <label className="text-sm font-medium block">Ghi chú thêm (tùy chọn):</label>
      <input
        type="text"
        value={reviewComment}
        onChange={(e) => setReviewComment(e.target.value)}
        placeholder="VD: Em sẽ trao đổi trực tiếp..."
        className="w-full text-sm rounded border border-input bg-background px-3 py-2"
      />

      {error && <div className="text-xs text-destructive">{error}</div>}

      <div className="flex gap-2 justify-end flex-wrap">
        {!editing && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing(true)}
            disabled={loading}
          >
            <Edit3 className="h-3 w-3" /> Chỉnh sửa nội dung
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRejecting(true)}
          disabled={loading}
        >
          <X className="h-3 w-3" /> Từ chối
        </Button>
        <Button size="sm" onClick={handleApprove} disabled={loading}>
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3 w-3" />
          )}
          Duyệt & Gửi nhắc nhở
        </Button>
      </div>
    </div>
  );
}
