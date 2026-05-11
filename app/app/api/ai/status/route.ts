import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { canUseAI } from "@/lib/permissions";
import { getActiveProvider } from "@/lib/ai";

/**
 * Trả về CHỈ status, KHÔNG tiết lộ provider/model nào đang dùng.
 * User chỉ cần biết AI có sẵn sàng không.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseAI(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const available = !!getActiveProvider();
  return NextResponse.json({ available });
}
