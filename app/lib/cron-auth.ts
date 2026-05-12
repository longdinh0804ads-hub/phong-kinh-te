/**
 * Helper auth chung cho cron endpoints.
 * Accept: Bearer header HOẶC ?secret=... query param.
 *
 * Đặt CRON_SECRET trong env, cron-job.org gọi với header.
 */
import { NextRequest, NextResponse } from "next/server";

export function verifyCronAuth(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET không cấu hình" }, { status: 500 });
  }
  const auth = req.headers.get("authorization");
  const querySecret = req.nextUrl.searchParams.get("secret");
  const headerSecret = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const provided = headerSecret || querySecret;
  if (!provided || provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null; // pass
}
