import { NextRequest, NextResponse } from "next/server";
import { runMorningDigest } from "@/lib/ai-monitor/morning-digest";
import { verifyCronAuth } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Cron endpoint: Morning Digest - chạy 8h sáng VN (1h UTC).
 * Setup tại cron-job.org với schedule: 0 1 * * *
 */
async function handle(req: NextRequest) {
  const authErr = verifyCronAuth(req);
  if (authErr) return authErr;

  try {
    const result = await runMorningDigest();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    console.error("[cron/morning-digest] Failed:", e?.message);
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;
