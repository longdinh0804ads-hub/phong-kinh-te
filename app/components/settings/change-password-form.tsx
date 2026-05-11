"use client";

import { useState } from "react";
import { changePassword } from "@/actions/password";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

const POLICY_HINTS = [
  "Ít nhất 12 ký tự",
  "Có 3 trong 4: chữ hoa, chữ thường, số, ký tự đặc biệt",
  "Không chứa email hoặc tên của bạn",
  "Không trùng 5 mật khẩu gần nhất",
];

export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string; errors?: string[] } | null>(
    null
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (next !== confirm) {
      setMsg({ type: "err", text: "Mật khẩu nhập lại không khớp" });
      return;
    }

    setLoading(true);
    const r = await changePassword(current, next);
    if (!r.ok) {
      setMsg({ type: "err", text: r.error || "Đổi mật khẩu thất bại", errors: r.errors });
    } else {
      setMsg({ type: "ok", text: "Đổi mật khẩu thành công. Các phiên đăng nhập khác đã bị đăng xuất." });
      setCurrent("");
      setNext("");
      setConfirm("");
    }
    setLoading(false);
  }

  // Live policy check (chỉ visual hint, validation thật ở server)
  const checks = {
    length: next.length >= 12,
    complexity:
      [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(next)).length >= 3,
    different: next.length > 0 && current.length > 0 ? next !== current : null,
    match: next.length > 0 && confirm.length > 0 ? next === confirm : null,
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="cur">Mật khẩu hiện tại</Label>
        <Input
          id="cur"
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new">Mật khẩu mới</Label>
        <Input
          id="new"
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="conf">Nhập lại mật khẩu mới</Label>
        <Input
          id="conf"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
        />
      </div>

      <div className="bg-muted/40 rounded-md p-3 text-xs space-y-1">
        <div className="font-medium mb-1">Yêu cầu mật khẩu:</div>
        <PolicyCheck label="Tối thiểu 12 ký tự" ok={checks.length} />
        <PolicyCheck
          label="3 trong 4 loại: chữ HOA, chữ thường, số, ký tự đặc biệt"
          ok={checks.complexity}
        />
        {checks.different !== null && (
          <PolicyCheck label="Khác mật khẩu hiện tại" ok={checks.different} />
        )}
        {checks.match !== null && (
          <PolicyCheck label="Hai ô mật khẩu mới khớp nhau" ok={checks.match} />
        )}
        <div className="mt-1 text-muted-foreground">
          {POLICY_HINTS[3]} (kiểm tra tự động)
        </div>
      </div>

      {msg && (
        <div
          className={
            msg.type === "ok"
              ? "rounded-md bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700"
              : "rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive"
          }
        >
          <div>{msg.text}</div>
          {msg.errors && msg.errors.length > 0 && (
            <ul className="list-disc list-inside mt-1 space-y-0.5">
              {msg.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <Button type="submit" disabled={loading}>
        {loading && <Loader2 className="animate-spin h-4 w-4" />}
        Đổi mật khẩu
      </Button>
    </form>
  );
}

function PolicyCheck({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
      ) : (
        <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
      )}
      <span className={ok ? "text-emerald-700" : "text-muted-foreground"}>{label}</span>
    </div>
  );
}
