"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  Plus,
  RotateCcw,
  FlaskConical,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { updateApiKey, appendApiKeys, testApiKey } from "@/actions/admin";

interface Props {
  keyName: "GEMINI_API_KEYS" | "DEEPSEEK_API_KEY" | "ANTHROPIC_API_KEY";
  provider: "gemini" | "deepseek" | "anthropic";
}

export function ApiKeyForm({ keyName, provider }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string; latency?: number } | null>(null);

  /** APPEND: thêm key mới vào pool, giữ keys cũ */
  function handleAppend() {
    if (value.trim().length < 10) {
      setMsg({ type: "error", text: "API key tối thiểu 10 ký tự" });
      return;
    }
    setMsg(null);
    startTransition(async () => {
      try {
        const r = await appendApiKeys({ provider, value: value.trim() });
        if (r.success) {
          setMsg({
            type: "success",
            text: `Đã thêm ${r.added} key mới vào pool${
              r.duplicates ? ` (${r.duplicates} key đã tồn tại - bỏ qua)` : ""
            }. Tổng: ${r.total} keys.`,
          });
          setValue("");
          router.refresh();
        } else {
          setMsg({ type: "error", text: r.error || "Không thêm được" });
        }
      } catch (e: any) {
        setMsg({ type: "error", text: e?.message || "Lỗi" });
      }
    });
  }

  /** REPLACE: thay toàn bộ pool bằng value mới */
  function handleReplace() {
    if (value.trim().length < 10) {
      setMsg({ type: "error", text: "API key tối thiểu 10 ký tự" });
      return;
    }
    if (!confirm(
      "THAY TOÀN BỘ pool? Tất cả key cũ sẽ bị XÓA và thay bằng key vừa nhập. Bạn chắc chắn?"
    )) {
      return;
    }
    setMsg(null);
    startTransition(async () => {
      try {
        const r = await updateApiKey({ key: keyName, value: value.trim() });
        if (r.success) {
          setMsg({ type: "success", text: "Đã thay toàn bộ pool. Rotator reloaded." });
          setValue("");
          router.refresh();
        }
      } catch (e: any) {
        setMsg({ type: "error", text: e?.message || "Lỗi" });
      }
    });
  }

  function handleTest() {
    setTestResult(null);
    startTransition(async () => {
      try {
        const r = await testApiKey(provider);
        setTestResult({ ok: r.success, text: r.message, latency: r.latencyMs });
      } catch (e: any) {
        setTestResult({ ok: false, text: e?.message || "Lỗi" });
      }
    });
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Nhập 1 hoặc nhiều API key (cách nhau bởi dấu phẩy/xuống dòng).&#10;Ví dụ: AIzaSyXxx, AIzaSyYyy, AIzaSyZzz"
        rows={3}
        className="font-mono text-xs"
        disabled={isPending}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={handleAppend}
          disabled={isPending || !value.trim()}
          size="sm"
          title="Thêm key mới vào pool, giữ các key hiện có"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Thêm vào pool
        </Button>
        <Button
          onClick={handleReplace}
          disabled={isPending || !value.trim()}
          variant="outline"
          size="sm"
          title="XÓA toàn bộ key cũ, thay bằng key vừa nhập"
        >
          <RotateCcw className="h-4 w-4" />
          Thay toàn bộ
        </Button>
        <Button
          onClick={handleTest}
          disabled={isPending}
          variant="ghost"
          size="sm"
          title="Test key đầu tiên trong pool xem có hoạt động không"
        >
          <FlaskConical className="h-4 w-4" />
          Test key hiện tại
        </Button>
      </div>
      {msg && (
        <div
          className={`text-xs px-2 py-1.5 rounded ${
            msg.type === "success"
              ? "bg-green-100 text-green-800"
              : msg.type === "error"
              ? "bg-red-100 text-red-800"
              : "bg-blue-100 text-blue-800"
          }`}
        >
          {msg.text}
        </div>
      )}
      {testResult && (
        <div
          className={`text-xs px-2 py-1.5 rounded flex items-start gap-2 ${
            testResult.ok ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
          }`}
        >
          {testResult.ok ? (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          ) : (
            <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          )}
          <span className="break-all">
            {testResult.text}
            {testResult.latency !== undefined && (
              <span className="ml-2 text-muted-foreground">· {testResult.latency}ms</span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
