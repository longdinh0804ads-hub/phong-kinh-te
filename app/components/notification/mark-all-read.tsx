"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { markAllAsRead } from "@/actions/notification";
import { Check, Loader2 } from "lucide-react";

export function MarkAllReadButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function click() {
    startTransition(async () => {
      await markAllAsRead();
      router.refresh();
    });
  }

  return (
    <Button onClick={click} disabled={isPending} variant="outline">
      {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      Đánh dấu đã đọc tất cả
    </Button>
  );
}
