"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, LogIn, Building2 } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const errorParam = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    errorParam === "inactive" ? "Tài khoản đã bị vô hiệu hóa." :
    errorParam === "forbidden" ? "Bạn không có quyền truy cập trang này." :
    null
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await authClient.signIn.email({
      email,
      password,
      callbackURL: callbackUrl,
    });

    if (result.error) {
      setError(result.error.message || "Đăng nhập thất bại. Vui lòng kiểm tra email và mật khẩu.");
      setLoading(false);
    } else {
      router.push(callbackUrl);
      router.refresh();
    }
  }

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
              <Label htmlFor="email" className="text-base">Email công vụ</Label>
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
              <Label htmlFor="password" className="text-base">Mật khẩu</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                disabled={loading}
              />
            </div>
            {error && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
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
