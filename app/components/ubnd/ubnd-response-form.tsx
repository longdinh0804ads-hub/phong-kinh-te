"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { submitUBNDResponse } from "@/actions/ubnd";
import { Loader2, Send } from "lucide-react";

export function UBNDResponseForm({ id, initial }: { id: string; initial: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [response, setResponse] = useState(initial);
  const [status, setStatus] = useState<"IN_PROGRESS" | "COMPLETED">("COMPLETED");

  function submit() {
    startTransition(async () => {
      await submitUBNDResponse({ id, phongResponse: response, status });
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <Textarea
        value={response}
        onChange={(e) => setResponse(e.target.value)}
        rows={5}
        placeholder="Nhập nội dung phản hồi/báo cáo cho UBND xã..."
      />
      <div className="flex items-center gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as any)}
          className="h-10 px-3 rounded-md border bg-background text-sm"
        >
          <option value="IN_PROGRESS">Đang xử lý</option>
          <option value="COMPLETED">Hoàn thành</option>
        </select>
        <Button onClick={submit} disabled={isPending || response.length < 10}>
          {isPending ? <Loader2 className="animate-spin h-4 w-4" /> : <Send className="h-4 w-4" />}
          Gửi phản hồi
        </Button>
      </div>
    </div>
  );
}
