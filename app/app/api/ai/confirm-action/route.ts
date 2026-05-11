import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { canUseAI } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { executeTool } from "@/lib/ai-tools/registry";
import { isDryRunResult } from "@/lib/ai-tools/types";
import { checkRateLimit, cleanupRateLimiterIfNeeded } from "@/lib/rate-limiter";

export const runtime = "nodejs";

/**
 * Endpoint xác nhận và thực thi 1 write action mà AI đã chuẩn bị.
 * UI gọi sau khi user click "Xác nhận" trên confirmation card.
 *
 * Body: { tool: string, input: object, confirm: boolean }
 * - confirm=true → thực sự thực thi
 * - confirm=false → chỉ trả lại "đã hủy"
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseAI(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Rate limit: 30 confirm/phút/user (chống lạm dụng nếu UI có bug)
  cleanupRateLimiterIfNeeded();
  const rl = checkRateLimit(`ai-confirm:${user.id}`, 30, 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Quá nhiều thao tác. Thử lại sau ${Math.ceil(rl.resetAfterMs / 1000)}s.` },
      { status: 429 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  const { tool, input, confirm } = body;
  if (typeof tool !== "string" || !tool) {
    return NextResponse.json({ error: "Thiếu tool name" }, { status: 400 });
  }
  if (typeof input !== "object" || input == null) {
    return NextResponse.json({ error: "Thiếu input" }, { status: 400 });
  }

  // User hủy
  if (confirm === false) {
    return NextResponse.json({
      success: true,
      cancelled: true,
      message: "Đã hủy thao tác.",
    });
  }

  // Execute với confirmed=true
  const result = await executeTool(tool, input, {
    user: {
      id: user.id,
      role: user.role,
      name: user.name,
      teamGroupCode: user.teamGroupCode,
      department: user.department,
      managedDepartments: user.managedDepartments,
    },
    confirmed: true,
  });

  if (!result.success) {
    return NextResponse.json({
      success: false,
      message: result.error || "Thao tác thất bại",
    });
  }

  // Tool trả về DryRunResult lần nữa = có gì đó sai (logic check ctx.confirmed)
  if (isDryRunResult(result.output)) {
    return NextResponse.json({
      success: false,
      message: "Lỗi: tool không nhận ra trạng thái confirmed",
    });
  }

  // Revalidate paths dependent
  if (tool === "createTask" || tool === "updateTaskStatus" || tool === "addProgressReport") {
    revalidatePath("/tasks");
    revalidatePath("/");
  } else if (tool === "createReminder") {
    revalidatePath("/schedule");
  }

  return NextResponse.json({
    success: true,
    message: result.output?.message || "Đã thực hiện thành công.",
    output: result.output,
  });
}
