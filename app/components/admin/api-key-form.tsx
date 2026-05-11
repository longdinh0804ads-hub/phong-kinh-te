"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, FlaskConical, CheckCircle2, XCircle } from "lucide-react";
import { updateApiKey, testApiKey } from "@/actions/admin";

interface Props {
  keyName: "GEMINI_API_KEYS" | "DEEPSEEK_API_KEY" | "ANTHROPIC_API_KEY";
  provider: "gemini" | "deepseek" | "anthropic";
}

export function ApiKeyForm({ keyName, provider }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string; latency?: number } | null>(null);

  function handleSave() {
    if (value.trim().length < 10) {
      setMsg({ type: "error", text: "API key tối thiểu 10 ký tự" });
      return;
    }
    setMsg(null);
    startTransition(async () => {
      try {
        const r = await updateApiKey({ key: keyName, value: value.trim() });
        if (r.success) {
          setMsg({ type: "success", text: "Đã lưu. Key có hiệu lực ngay (rotator reloaded)." });
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
        placeholder={
          keyName === "GEMINI_API_KEYS"
            ? "AIzaSyXxx,AIzaSyYyy (multi-key phân cách bằng dấu phẩy)"
            : "AIzaSyXxx hoặc sk-xxx hoặc sk-ant-xxx"
        }
        rows={2}
        className="font-mono text-xs"
        disabled={isPending}
      />
      <div className="flex flex-wrap gap-2">
        <Button onClick={handleSave} disabled={isPending || !value.trim()} size="sm">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Lưu key mới
        </Button>
        <Button onClick={handleTest} disabled={isPending} variant="outline" size="sm">
          <FlaskConical className="h-4 w-4" />
          Test key hiện tại
        </Button>
      </div>
      {msg && (
        <div
          className={`text-xs px-2 py-1.5 rounded ${
            msg.type === "success"
              ? "bg-green-100 text-green-800"
              : "bg-red-100 text-red-800"
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
