import { NextRequest, NextResponse } from "next/server";
import { runDayEndDigest } from "@/lib/ai-monitor/dayend-digest";
import { verifyCronAuth } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Cron endpoint: Day-End Digest - chạy 16h chiều VN (9h UTC).
 * Setup tại cron-job.org với schedule: 0 9 * * *
 */
async function handle(req: NextRequest) {
  const authErr = verifyCronAuth(req);
  if (authErr) return authErr;

  try {
    const result = await runDayEndDigest();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    console.error("[cron/dayend-digest] Failed:", e?.message);
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;
