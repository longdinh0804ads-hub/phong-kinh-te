import { NextRequest, NextResponse } from "next/server";
import { runPerformanceAnalysis } from "@/lib/ai-monitor/performance-analyzer";
import { verifyCronAuth } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Cron endpoint: Performance Analysis - chạy daily.
 * Setup tại cron-job.org với schedule: 0 10 * * * (10h UTC = 17h VN, sau dayend digest)
 */
async function handle(req: NextRequest) {
  const authErr = verifyCronAuth(req);
  if (authErr) return authErr;

  try {
    const result = await runPerformanceAnalysis();
    return NextResponse.json({
      ok: true,
      usersAnalyzed: result.usersAnalyzed,
      proposalsCreated: result.proposalsCreated,
      proposalsSkippedDedup: result.proposalsSkippedDedup,
      flaggedCount: result.flagged.length,
      errors: result.errors,
    });
  } catch (e: any) {
    console.error("[cron/performance-analysis] Failed:", e?.message);
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;
