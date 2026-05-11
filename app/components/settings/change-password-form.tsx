"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next !== confirm) {
      setMsg({ type: "err", text: "Mật khẩu nhập lại không khớp" });
      return;
    }
    if (next.length < 6) {
      setMsg({ type: "err", text: "Mật khẩu phải tối thiểu 6 ký tự" });
      return;
    }
    setLoading(true);
    const r = await authClient.changePassword({ currentPassword: current, newPassword: next });
    if (r.error) {
      setMsg({ type: "err", text: r.error.message || "Đổi mật khẩu thất bại" });
    } else {
      setMsg({ type: "ok", text: "Đổi mật khẩu thành công" });
      setCurrent(""); setNext(""); setConfirm("");
    }
    setLoading(false);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="cur">Mật khẩu hiện tại</Label>
        <Input id="cur" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new">Mật khẩu mới</Label>
        <Input id="new" type="password" value={next} onChange={(e) => setNext(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="conf">Nhập lại mật khẩu mới</Label>
        <Input id="conf" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </div>
      {msg && (
        <p className={msg.type === "ok" ? "text-emerald-600 text-sm" : "text-destructive text-sm"}>{msg.text}</p>
      )}
      <Button type="submit" disabled={loading}>
        {loading && <Loader2 className="animate-spin h-4 w-4" />}
        Đổi mật khẩu
      </Button>
    </form>
  );
}
