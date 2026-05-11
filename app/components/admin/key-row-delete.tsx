"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { removeApiKeyByIndex } from "@/actions/admin";

interface Props {
  provider: "gemini" | "deepseek" | "anthropic";
  keyIndex: number;
  keyPrefix: string;
  totalKeys: number;
}

export function KeyRowDelete({ provider, keyIndex, keyPrefix, totalKeys }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (
      !confirm(
        `Xóa key #${keyIndex + 1} (${keyPrefix}••••) khỏi pool ${provider}?\n${
          totalKeys === 1
            ? "Đây là key cuối cùng - sau khi xóa provider sẽ KHÔNG còn key nào, AI có thể fail!"
            : `Còn lại ${totalKeys - 1} key sau khi xóa.`
        }`
      )
    )
      return;

    startTransition(async () => {
      try {
        const r = await removeApiKeyByIndex({ provider, keyIndex });
        if (!r.success) alert(r.error || "Không xóa được");
        else router.refresh();
      } catch (e: any) {
        alert(e?.message || "Lỗi");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      className="p-1 rounded hover:bg-red-100 text-muted-foreground hover:text-red-600 transition-colors disabled:opacity-50"
      title="Xóa key này khỏi pool"
    >
      {isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Trash2 className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
