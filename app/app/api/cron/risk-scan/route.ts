import { NextRequest, NextResponse } from "next/server";
import { runRiskScan } from "@/lib/ai-monitor/scanner";

export const runtime = "nodejs";
export const maxDuration = 120; // scan có thể chạy lâu

/**
 * Cron endpoint: chạy risk scanner mỗi 30 phút.
 *
 * Bảo mật: Authorization header "Bearer <CRON_SECRET>" hoặc query ?secret=...
 * Được gọi bởi external cron (cron-job.org / GitHub Actions / OS cron).
 *
 * Trả về JSON summary để cron log lại.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET không được cấu hình" },
      { status: 500 }
    );
  }

  // Verify auth
  const auth = req.headers.get("authorization");
  const querySecret = req.nextUrl.searchParams.get("secret");
  const headerSecret = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const providedSecret = headerSecret || querySecret;
  if (!providedSecret || providedSecret !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runRiskScan();
    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (e: any) {
    console.error("[cron/risk-scan] Failed:", e?.message);
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}

// Hỗ trợ cả GET (cho cron-job.org đơn giản) và POST (Vercel cron / GitHub Actions)
export const GET = handle;
export const POST = handle;
