import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { getCaptchaSiteKey } from "@/lib/security/captcha";

export default function LoginPage() {
  const captchaSiteKey = getCaptchaSiteKey();
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">Đang tải...</div>
      }
    >
      <LoginForm captchaSiteKey={captchaSiteKey} />
    </Suspense>
  );
}
