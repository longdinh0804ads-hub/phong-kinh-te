"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { verify2FA } from "@/actions/two-factor";
import { logoutAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Loader2, AlertTriangle, LogOut } from "lucide-react";

export function TwoFAVerifyForm({
  userName,
  callbackUrl,
}: {
  userName: string;
  callbackUrl: string;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useBackup, setUseBackup] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const r = await verify2FA(code);
    if (r.ok) {
      router.push(callbackUrl);
      router.refresh();
    } else {
      setError(r.error || "Xác thực thất bại");
      setLoading(false);
    }
  }

  async function handleLogout() {
    await logoutAction();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100 px-4 py-8">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Shield className="h-9 w-9 text-primary" />
          </div>
          <CardTitle className="text-2xl">Xác thực 2 yếu tố</CardTitle>
          <CardDescription>
            Chào <strong>{userName}</strong>
            <br />
            {useBackup
              ? "Nhập 1 mã backup (10 ký tự, có dấu gạch ngang)"
              : "Mở ứng dụng Authenticator và nhập mã 6 chữ số"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Input
                type="text"
                inputMode={useBackup ? "text" : "numeric"}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={useBackup ? "ABCDE-FGHIJ" : "000 000"}
                maxLength={useBackup ? 11 : 6}
                pattern={useBackup ? "[A-Z0-9-]+" : "[0-9]*"}
                autoComplete="one-time-code"
                autoFocus
                required
                disabled={loading}
                className="text-center text-2xl tracking-widest font-mono h-14"
              />
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" className="w-full" size="lg" disabled={loading || !code}>
              {loading && <Loader2 className="animate-spin" />}
              Xác nhận
            </Button>

            <div className="flex justify-between text-xs">
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() => {
                  setUseBackup(!useBackup);
                  setCode("");
                  setError(null);
                }}
              >
                {useBackup ? "Quay lại nhập mã từ ứng dụng" : "Dùng mã backup"}
              </button>
              <button
                type="button"
                className="text-muted-foreground hover:underline inline-flex items-center gap-1"
                onClick={handleLogout}
              >
                <LogOut className="h-3 w-3" /> Đăng xuất
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
