"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { updateTTHC } from "@/actions/tthc";
import { Play, CheckCircle2, RotateCcw, Loader2 } from "lucide-react";

export function TTHCStatusActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function change(s: "RECEIVED" | "PROCESSING" | "COMPLETED" | "RETURNED") {
    startTransition(async () => {
      await updateTTHC({ id, status: s });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status === "RECEIVED" && (
        <Button onClick={() => change("PROCESSING")} disabled={isPending} variant="outline">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Bắt đầu xử lý
        </Button>
      )}
      {(status === "RECEIVED" || status === "PROCESSING") && (
        <>
          <Button onClick={() => change("COMPLETED")} disabled={isPending}>
            <CheckCircle2 className="h-4 w-4" />
            Hoàn tất
          </Button>
          <Button onClick={() => change("RETURNED")} disabled={isPending} variant="destructive">
            <RotateCcw className="h-4 w-4" />
            Trả lại
          </Button>
        </>
      )}
    </div>
  );
}
