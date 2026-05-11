/**
 * Cloudflare Turnstile verification (server-side).
 * Sitekey: NEXT_PUBLIC_TURNSTILE_SITE_KEY (client)
 * Secret:  TURNSTILE_SECRET_KEY (server)
 *
 * Trong dev, có thể set TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
 * (Cloudflare always-passing test key) hoặc bỏ trống → captcha auto-pass.
 */
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyCaptcha(token: string, ipAddress?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  // Dev/demo mode: không cấu hình secret → bypass (nhưng vẫn yêu cầu có token)
  if (!secret) {
    console.warn("[captcha] TURNSTILE_SECRET_KEY chưa cấu hình - captcha bypass");
    return !!token; // ít nhất phải có token client gửi lên
  }

  if (!token) return false;

  const formData = new URLSearchParams();
  formData.append("secret", secret);
  formData.append("response", token);
  if (ipAddress && ipAddress !== "unknown") {
    formData.append("remoteip", ipAddress);
  }

  try {
    const resp = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
      // Timeout 5s
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return false;
    const data = (await resp.json()) as { success: boolean; "error-codes"?: string[] };
    if (!data.success) {
      console.warn("[captcha] verify failed:", data["error-codes"]);
    }
    return !!data.success;
  } catch (e) {
    console.error("[captcha] verify error:", e);
    return false;
  }
}

export function isCaptchaConfigured(): boolean {
  return !!process.env.TURNSTILE_SECRET_KEY && !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
}

/** Sitekey cho client (publicly safe). */
export function getCaptchaSiteKey(): string | null {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null;
}
