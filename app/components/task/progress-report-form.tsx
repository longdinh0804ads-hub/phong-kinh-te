"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addProgressReport } from "@/actions/task";
import { Loader2, Send } from "lucide-react";

interface Props {
  taskId: string;
  currentPercent: number;
}

export function ProgressReportForm({ taskId, currentPercent }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [percent, setPercent] = useState(currentPercent);
  const [notes, setNotes] = useState("");
  const [blockers, setBlockers] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await addProgressReport({
        taskId,
        percentComplete: percent,
        notes: notes || null,
        blockers: blockers || null,
      });

      if (result.error) {
        setError(result.error);
      } else {
        setNotes("");
        setBlockers("");
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 border-t pt-4">
      <div className="space-y-2">
        <Label htmlFor="percent">Tiến độ ({percent}%)</Label>
        {/* Q6: Quick chips - dễ chọn cho cán bộ không thạo IT */}
        <div className="flex flex-wrap gap-2">
          {[0, 25, 50, 75, 100].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setPercent(v)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors min-w-[3rem] ${
                percent === v
                  ? v === 100
                    ? "bg-green-600 text-white border-green-600"
                    : "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-muted border-input"
              }`}
            >
              {v === 100 ? "✓ 100%" : `${v}%`}
            </button>
          ))}
        </div>
        <Input
          id="percent"
          type="range"
          min="0"
          max="100"
          step="5"
          value={percent}
          onChange={(e) => setPercent(parseInt(e.target.value))}
          className="cursor-pointer"
          aria-label="Tinh chỉnh tiến độ"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Ghi chú tiến độ</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Đã làm gì, kết quả..."
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="blockers">Khó khăn / Vướng mắc (nếu có)</Label>
        <Textarea
          id="blockers"
          value={blockers}
          onChange={(e) => setBlockers(e.target.value)}
          rows={2}
          placeholder="Cần hỗ trợ gì..."
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={isPending} size="sm">
        {isPending ? <Loader2 className="animate-spin h-4 w-4" /> : <Send className="h-4 w-4" />}
        Gửi báo cáo tiến độ
      </Button>
    </form>
  );
}
