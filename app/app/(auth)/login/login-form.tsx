"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loginAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, LogIn, Building2, AlertTriangle } from "lucide-react";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { getDeviceFingerprint } from "@/lib/security/client-fingerprint";

export function LoginForm({ captchaSiteKey }: { captchaSiteKey: string | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const errorParam = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [requireCaptcha, setRequireCaptcha] = useState(false);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    errorParam === "inactive"
      ? "Tài khoản đã bị vô hiệu hóa."
      : errorParam === "forbidden"
      ? "Bạn không có quyền truy cập trang này."
      : errorParam === "session_expired"
      ? "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại."
      : errorParam === "device_changed"
      ? "Phát hiện thay đổi thiết bị, vui lòng đăng nhập lại."
      : null
  );
  const [loading, setLoading] = useState(false);

  // Tính device fingerprint khi mount
  useEffect(() => {
    getDeviceFingerprint().then(setDeviceId).catch(() => setDeviceId(null));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await loginAction(
      email,
      password,
      captchaToken || undefined,
      deviceId || undefined
    );

    if (result.ok) {
      if (result.mustChangePassword) {
        router.push("/change-password?required=1");
      } else if (result.require2FA) {
        router.push("/login/2fa?callbackUrl=" + encodeURIComponent(callbackUrl));
      } else {
        router.push(callbackUrl);
      }
      router.refresh();
      return;
    }

    setError(result.error || "Đăng nhập thất bại");
    if (result.requireCaptcha) {
      setRequireCaptcha(true);
      setCaptchaToken(null);
      setCaptchaResetKey((k) => k + 1);
    }
    if (result.lockedUntil) {
      setLockedUntil(result.lockedUntil);
    }
    setLoading(false);
  }

  const remainingMinutes = lockedUntil
    ? Math.max(0, Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 60000))
    : 0;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100 px-4 py-8">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Building2 className="h-9 w-9 text-primary" />
          </div>
          <CardTitle className="text-2xl">Phòng Kinh Tế</CardTitle>
          <CardDescription className="text-base">
            Xã Trần Phú - Thành phố Hà Nội
            <br />
            Hệ thống quản lý nội bộ
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-base">
                Email công vụ
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="ten@phongkinhte-tranphu.vn"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-base">
                Mật khẩu
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                disabled={loading}
              />
            </div>

            {requireCaptcha && captchaSiteKey && (
              <div className="flex justify-center">
                <TurnstileWidget
                  siteKey={captchaSiteKey}
                  onVerify={(t) => setCaptchaToken(t)}
                  onError={() => setCaptchaToken(null)}
                  resetKey={captchaResetKey}
                />
              </div>
            )}

            {error && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  {error}
                  {lockedUntil && remainingMinutes > 0 && (
                    <div className="mt-1 text-xs">
                      Mở khóa sau khoảng {remainingMinutes} phút.
                    </div>
                  )}
                </div>
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={loading || (requireCaptcha && !captchaToken)}
            >
              {loading ? <Loader2 className="animate-spin" /> : <LogIn />}
              {loading ? "Đang đăng nhập..." : "Đăng nhập"}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            © 2026 UBND Xã Trần Phú - Phòng Kinh Tế
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
