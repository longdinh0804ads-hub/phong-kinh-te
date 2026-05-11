"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { resolveIHanoi } from "@/actions/ihanoi";
import { Loader2, CheckCircle2 } from "lucide-react";

export function IHanoiResolveForm({ id, initial }: { id: string; initial: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [text, setText] = useState(initial);

  function submit() {
    startTransition(async () => {
      await resolveIHanoi({ id, resolution: text, status: "COMPLETED" });
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="Mô tả kết quả xử lý phản ánh..." />
      <Button onClick={submit} disabled={isPending || text.length < 10}>
        {isPending ? <Loader2 className="animate-spin h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
        Hoàn tất xử lý
      </Button>
    </div>
  );
}
