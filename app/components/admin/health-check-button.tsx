"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2 } from "lucide-react";
import { runAllKeyHealthCheck } from "@/actions/admin";

export function HealthCheckButton({ size = "sm" }: { size?: "sm" | "default" }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: number; failed: number; ms: number } | null>(null);

  function handleCheck() {
    setResult(null);
    startTransition(async () => {
      try {
        const r = await runAllKeyHealthCheck();
        setResult({ ok: r.okKeys, failed: r.failedKeys, ms: r.durationMs });
        router.refresh();
      } catch (e: any) {
        setResult({ ok: 0, failed: -1, ms: 0 });
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button onClick={handleCheck} disabled={isPending} size={size} variant="outline">
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        Check tất cả keys
      </Button>
      {result && (
        <span
          className={`text-xs ${
            result.failed > 0 ? "text-amber-700" : "text-green-700"
          }`}
        >
          {result.ok} OK · {result.failed} lỗi · {result.ms}ms
        </span>
      )}
    </div>
  );
}
