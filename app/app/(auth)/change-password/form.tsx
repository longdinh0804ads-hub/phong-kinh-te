"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { changePassword } from "@/actions/password";
import { logoutAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyRound, Loader2, AlertTriangle, LogOut, CheckCircle2, XCircle } from "lucide-react";

export function ForceChangePasswordForm({
  userName,
  email,
}: {
  userName: string;
  email: string;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setErrors([]);
    if (next !== confirm) {
      setError("Mật khẩu nhập lại không khớp");
      return;
    }
    setLoading(true);
    const r = await changePassword(current, next);
    if (r.ok) {
      router.push("/");
      router.refresh();
    } else {
      setError(r.error || "Đổi mật khẩu thất bại");
      setErrors(r.errors || []);
      setLoading(false);
    }
  }

  async function handleLogout() {
    await logoutAction();
    router.push("/login");
    router.refresh();
  }

  const checks = {
    length: next.length >= 12,
    complexity:
      [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(next)).length >= 3,
    different: next.length > 0 && current.length > 0 ? next !== current : null,
    match: next.length > 0 && confirm.length > 0 ? next === confirm : null,
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 to-slate-100 px-4 py-8">
      <Card className="w-full max-w-lg shadow-xl">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center">
            <KeyRound className="h-9 w-9 text-amber-600" />
          </div>
          <CardTitle className="text-2xl">Bắt buộc đổi mật khẩu</CardTitle>
          <CardDescription>
            Chào <strong>{userName}</strong> ({email})
            <br />
            Đây là lần đăng nhập đầu tiên với mật khẩu do quản trị viên cấp.
            <br />
            Vui lòng đặt mật khẩu mới của riêng bạn.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cur">Mật khẩu hiện tại (do quản trị viên cấp)</Label>
              <Input
                id="cur"
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                required
                autoFocus
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
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    {error}
                    {errors.length > 0 && (
                      <ul className="list-disc list-inside mt-1 space-y-0.5">
                        {errors.map((e, i) => (
                          <li key={i}>{e}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="text-muted-foreground"
              >
                <LogOut className="h-4 w-4" /> Đăng xuất
              </Button>
              <Button type="submit" disabled={loading} size="lg">
                {loading && <Loader2 className="animate-spin h-4 w-4" />}
                Đổi mật khẩu
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
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
