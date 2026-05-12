"use server";

/**
 * Speech Writer server actions.
 * Pattern: stateless — gọi LLM trực tiếp, trả kết quả về client.
 * Không persist bài phát biểu vào DB (TP tự copy-paste hoặc lưu file).
 * Log AIAuditLog để self-improving sau.
 */
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { isTopLeader, isDeptManager } from "@/lib/permissions";
import {
  generateSpeech,
  type SpeechInput,
  type SpeechResult,
} from "@/lib/ai-agents/speech-writer";

export async function generateSpeechAction(
  input: SpeechInput
): Promise<{ ok: true; result: SpeechResult } | { ok: false; error: string }> {
  const user = await requireAuth();

  // Permission: TP/PTP/TBP + SUPER_ADMIN
  if (
    !isTopLeader(user.role) &&
    !isDeptManager(user.role) &&
    user.role !== "SUPER_ADMIN"
  ) {
    return { ok: false, error: "Bạn không có quyền dùng Speech Writer" };
  }

  if (!input.topic || input.topic.length < 5) {
    return { ok: false, error: "Vui lòng nhập chủ đề ≥5 ký tự" };
  }

  const start = Date.now();
  try {
    const result = await generateSpeech(input);
    // Audit log (best-effort)
    try {
      await db.aIAuditLog.create({
        data: {
          userId: user.id,
          action: "tool:generateSpeech",
          tool: "speech-writer",
          input: {
            occasion: input.occasion,
            audience: input.audience,
            length: input.length,
            topic: input.topic,
            hasContext: !!input.context,
            citationCount: input.manualCitations?.length || 0,
          },
          output: {
            wordCount: result.wordCount,
            citationCount: result.citations.length,
            outlineCount: result.outline.length,
            warningsCount: result.warnings.length,
          },
          success: true,
          duration: Date.now() - start,
        },
      });
    } catch (e) {
      console.warn("[speech-writer] audit fail:", e);
    }
    return { ok: true, result };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Lỗi sinh bài phát biểu" };
  }
}
