"use server";

/**
 * Server actions cho Document Intake flow (Phase 2 AI Agent):
 *   1. dryClassifyDocument(formData) → ClassificationPreview (KHÔNG tạo record)
 *      - Extract text từ file
 *      - Classify (rule + LLM)
 *      - Trả về preview + signed HMAC token (stateless dry-run)
 *   2. confirmDocumentIntake(token, edits) → create records
 *      - Verify token (chống tamper, expire 15 phút)
 *      - Tạo UBNDDirective | LegalDocument | Task tùy routing
 *      - Log AIAuditLog cho self-improving sau
 *
 * Pattern stateless dry-run + confirm: chống user gọi confirm bằng input bịa.
 */

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { hasPermission, isTopLeader, isDeptManager } from "@/lib/permissions";
import { extractTextFromFile } from "@/lib/document-extractor";
import {
  classifyDocument,
  type Classification,
} from "@/lib/ai-agents/document-classifier";
import { chunkLegalText } from "@/lib/legal-parser";
import {
  embedBatch,
  vectorToSql,
  isEmbeddingAvailable,
  EMBEDDING_DIM,
} from "@/lib/embeddings";

const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 phút
const TOKEN_VERSION = "v1";

interface DryRunPayload {
  v: string;
  exp: number;
  uid: string;
  classification: Classification;
  fullText: string;
  fileName: string;
}

function signPayload(payload: DryRunPayload): string {
  const secret = process.env.BETTER_AUTH_SECRET || "fallback";
  const json = JSON.stringify(payload);
  const sig = crypto.createHmac("sha256", secret).update(json).digest("base64url");
  return Buffer.from(json).toString("base64url") + "." + sig;
}

function verifyPayload(token: string, userId: string): DryRunPayload | null {
  const secret = process.env.BETTER_AUTH_SECRET || "fallback";
  const [b64, sig] = token.split(".");
  if (!b64 || !sig) return null;
  const json = Buffer.from(b64, "base64url").toString("utf8");
  const expected = crypto.createHmac("sha256", secret).update(json).digest("base64url");
  if (expected !== sig) return null;
  try {
    const payload = JSON.parse(json) as DryRunPayload;
    if (payload.v !== TOKEN_VERSION) return null;
    if (payload.exp < Date.now()) return null;
    if (payload.uid !== userId) return null; // chống cross-user
    return payload;
  } catch {
    return null;
  }
}

export interface ClassificationPreview {
  ok: boolean;
  error?: string;
  classification?: Classification;
  /** Signed token để confirm */
  token?: string;
  /** Excerpt văn bản hiển thị UI */
  textExcerpt?: string;
  textLength?: number;
}

// ============== ACTION 1: dryClassifyDocument ==============

export async function dryClassifyDocument(
  formData: FormData
): Promise<ClassificationPreview> {
  const user = await requireAuth();

  // Permission: TP/PTP/TBP và Admin được upload văn bản đến
  if (!isTopLeader(user.role) && !isDeptManager(user.role) && user.role !== "SUPER_ADMIN") {
    return { ok: false, error: "Bạn không có quyền tiếp nhận văn bản" };
  }

  const file = formData.get("file") as File | null;
  if (!file) return { ok: false, error: "Thiếu file" };

  // Extract text
  let extract;
  try {
    extract = await extractTextFromFile(file);
  } catch (e: any) {
    return { ok: false, error: e?.message || "Không đọc được file" };
  }

  if (extract.text.trim().length < 50) {
    return {
      ok: false,
      error: "Văn bản trích xuất quá ngắn. Có thể là PDF scan không OCR được, hoặc file rỗng.",
    };
  }

  // Classify
  let classification: Classification;
  try {
    classification = await classifyDocument(extract.text, { useLLM: true });
  } catch (e: any) {
    return { ok: false, error: `Lỗi phân loại: ${e?.message || "unknown"}` };
  }

  // Merge warnings từ extract
  classification.warnings = [...extract.warnings, ...classification.warnings];

  // Sign token chứa fullText để confirm sau (không lưu DB intermediate)
  const payload: DryRunPayload = {
    v: TOKEN_VERSION,
    exp: Date.now() + TOKEN_TTL_MS,
    uid: user.id,
    classification,
    fullText: extract.text,
    fileName: file.name,
  };
  const token = signPayload(payload);

  return {
    ok: true,
    classification,
    token,
    textExcerpt: extract.text.slice(0, 500),
    textLength: extract.text.length,
  };
}

// ============== ACTION 2: confirmDocumentIntake ==============

export interface IntakeConfirmInput {
  token: string;
  /** Override routing nếu TP muốn ép kiểu khác */
  routingOverride?: Classification["routing"];
  /** Override các trường metadata user đã sửa */
  edits?: {
    title?: string;
    docNumber?: string;
    docType?: Classification["docType"];
    issuedDate?: string; // YYYY-MM-DD
    effectiveDate?: string;
    summary?: string;
    deadline?: string; // for UBNDDirective
    assigneeId?: string | null; // for UBNDDirective
    suggestedDept?: string | null;
  };
  /** Có tạo task cho action items không */
  createTasksFromActionItems?: boolean;
  /** AssigneeId default cho tasks */
  defaultAssigneeId?: string | null;
}

export interface IntakeConfirmResult {
  ok: boolean;
  error?: string;
  createdType?: "UBND_DIRECTIVE" | "LEGAL_DOCUMENT" | "TASK_ONLY";
  createdId?: string;
  createdTaskIds?: string[];
}

export async function confirmDocumentIntake(
  input: IntakeConfirmInput
): Promise<IntakeConfirmResult> {
  const user = await requireAuth();
  const payload = verifyPayload(input.token, user.id);
  if (!payload) {
    return {
      ok: false,
      error: "Phiên tiếp nhận đã hết hạn hoặc không hợp lệ. Vui lòng upload lại file.",
    };
  }

  const c = payload.classification;
  const edits = input.edits || {};
  const finalRouting = input.routingOverride || c.routing;

  // Merge final values
  const finalTitle = edits.title ?? c.title ?? "(Không có tiêu đề)";
  const finalDocNumber = edits.docNumber ?? c.docNumber ?? "";
  const finalDocType = edits.docType ?? c.docType ?? "OTHER";
  const finalIssuedDate = edits.issuedDate ?? c.issuedDate;
  const finalEffectiveDate = edits.effectiveDate ?? c.effectiveDate;
  const finalSummary = edits.summary ?? c.summary;

  const auditStart = Date.now();

  try {
    if (finalRouting === "LEGAL_DOCUMENT") {
      // Check permission
      if (!hasPermission(user.role, "legal:upload")) {
        return { ok: false, error: "Bạn không có quyền lưu văn bản pháp lý" };
      }

      // Tránh trùng
      const exists = await db.legalDocument.findFirst({
        where: {
          docType: finalDocType === "OTHER" ? undefined : (finalDocType as any),
          docNumber: finalDocNumber,
        },
      });
      if (exists) {
        return {
          ok: false,
          error: `Văn bản đã tồn tại trong kho (${exists.title.slice(0, 60)})`,
        };
      }

      if (!finalDocNumber || finalDocType === "OTHER" || finalDocType === "CONG_VAN") {
        return {
          ok: false,
          error: "Văn bản pháp lý phải có docType (Luật/NĐ/TT/QĐ/NQ) và số văn bản",
        };
      }

      const chunks = chunkLegalText(payload.fullText);
      const doc = await db.legalDocument.create({
        data: {
          title: finalTitle,
          docType: finalDocType as any,
          docNumber: finalDocNumber,
          issuedDate: finalIssuedDate ? new Date(finalIssuedDate) : new Date(),
          effectiveDate: finalEffectiveDate
            ? new Date(finalEffectiveDate)
            : finalIssuedDate
            ? new Date(finalIssuedDate)
            : new Date(),
          summary: finalSummary || null,
          status: "active",
          uploadedById: user.id,
          chunks: {
            create: chunks.map((ch) => ({
              chunkIndex: ch.chunkIndex,
              article: ch.article,
              section: ch.section,
              point: ch.point,
              content: ch.content,
            })),
          },
        },
        include: { chunks: { select: { id: true, content: true, chunkIndex: true } } },
      });

      // Embed (best-effort)
      if (isEmbeddingAvailable()) {
        try {
          const sorted = [...doc.chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
          const vecs = await embedBatch(
            sorted.map((c) => c.content),
            "RETRIEVAL_DOCUMENT",
            4
          );
          for (let i = 0; i < sorted.length; i++) {
            const v = vecs[i];
            if (v && v.length === EMBEDDING_DIM) {
              await db.$executeRawUnsafe(
                `UPDATE legal_chunks SET embedding = $1::vector WHERE id = $2`,
                vectorToSql(v),
                sorted[i].id
              );
            }
          }
        } catch (e) {
          console.warn("[intake] embed fail:", e);
        }
      }

      await logAuditAction(user.id, "document-intake:create-legal", payload, doc.id, Date.now() - auditStart);
      revalidatePath("/legal");
      revalidatePath("/documents/intake");
      return { ok: true, createdType: "LEGAL_DOCUMENT", createdId: doc.id };
    }

    if (finalRouting === "UBND_DIRECTIVE") {
      if (!hasPermission(user.role, "ubnd:create")) {
        return { ok: false, error: "Bạn không có quyền tạo nhiệm vụ UBND" };
      }
      // Deadline mặc định: 30 ngày nếu không edit
      const deadline = edits.deadline
        ? new Date(edits.deadline)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const directive = await db.uBNDDirective.create({
        data: {
          documentNo: finalDocNumber || null,
          title: finalTitle,
          content: payload.fullText.slice(0, 50000), // cap
          issuedBy: c.issuingBody || "UBND Xã Trần Phú",
          issuedDate: finalIssuedDate ? new Date(finalIssuedDate) : new Date(),
          receivedDate: new Date(),
          deadline,
          status: "PENDING",
          assigneeId: edits.assigneeId || null,
        },
      });

      // Tạo task con từ action items nếu chọn
      const createdTaskIds: string[] = [];
      if (input.createTasksFromActionItems && c.actionItems.length > 0) {
        for (const ai of c.actionItems) {
          const taskDeadline = ai.deadline ? parseFlexibleDate(ai.deadline) : deadline;
          const task = await db.task.create({
            data: {
              title: ai.action.slice(0, 200),
              description: `Phát sinh từ UBND directive ${finalDocNumber || finalTitle}\n\nMô tả gốc: ${ai.action}\nNgười phụ trách (AI gợi ý): ${ai.owner || "chưa rõ"}`,
              deadline: taskDeadline,
              priority: c.urgency === "KHAN_CAP" ? "KHAN_CAP" : c.urgency === "CAO" ? "CAO" : "THUONG",
              status: "PENDING",
              creatorId: user.id,
              assigneeId: input.defaultAssigneeId || edits.assigneeId || null,
              sourceType: "UBND_DIRECTIVE",
              sourceId: directive.id,
            },
          });
          createdTaskIds.push(task.id);
        }
      }

      await logAuditAction(
        user.id,
        "document-intake:create-ubnd",
        payload,
        directive.id,
        Date.now() - auditStart
      );
      revalidatePath("/ubnd");
      revalidatePath("/tasks");
      revalidatePath("/documents/intake");
      return {
        ok: true,
        createdType: "UBND_DIRECTIVE",
        createdId: directive.id,
        createdTaskIds,
      };
    }

    if (finalRouting === "INTERNAL_TASK") {
      if (!hasPermission(user.role, "task:create")) {
        return { ok: false, error: "Bạn không có quyền tạo nhiệm vụ" };
      }
      const deadline = edits.deadline
        ? new Date(edits.deadline)
        : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      const task = await db.task.create({
        data: {
          title: finalTitle.slice(0, 200),
          description: finalSummary,
          deadline,
          priority:
            c.urgency === "KHAN_CAP" ? "KHAN_CAP" : c.urgency === "CAO" ? "CAO" : "THUONG",
          status: "PENDING",
          creatorId: user.id,
          assigneeId: edits.assigneeId || null,
          sourceType: "INTERNAL",
        },
      });
      await logAuditAction(
        user.id,
        "document-intake:create-task",
        payload,
        task.id,
        Date.now() - auditStart
      );
      revalidatePath("/tasks");
      return { ok: true, createdType: "TASK_ONLY", createdId: task.id };
    }

    return {
      ok: false,
      error: `Routing "${finalRouting}" cần xử lý thủ công - vui lòng chọn loại khác`,
    };
  } catch (e: any) {
    console.error("[document-intake] confirm error:", e);
    return { ok: false, error: `Lỗi tạo record: ${e?.message || "unknown"}` };
  }
}

// ============== HELPERS ==============

async function logAuditAction(
  userId: string,
  action: string,
  payload: DryRunPayload,
  createdId: string | null,
  durationMs: number
) {
  try {
    await db.aIAuditLog.create({
      data: {
        userId,
        action,
        tool: "document-classifier",
        input: {
          fileName: payload.fileName,
          textLength: payload.fullText.length,
          classification: {
            routing: payload.classification.routing,
            urgency: payload.classification.urgency,
            fields: payload.classification.fields,
            llmUsed: payload.classification.llmUsed,
          },
        },
        output: { createdId },
        success: true,
        duration: durationMs,
      },
    });
  } catch (e) {
    console.warn("[document-intake] audit log fail:", e);
  }
}

function parseFlexibleDate(s: string): Date {
  // Try YYYY-MM-DD
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (ymd) return new Date(s);
  // Try "Quý X/YYYY" → cuối quý
  const quy = /Quý\s*(\d)\/(\d{4})/i.exec(s);
  if (quy) {
    const q = parseInt(quy[1]);
    const y = parseInt(quy[2]);
    const month = q * 3 - 1; // Q1 = Mar, Q2 = Jun, ...
    return new Date(y, month, 28);
  }
  // Try "Tháng X/YYYY" → cuối tháng
  const thang = /Tháng\s*(\d+)\/(\d{4})/i.exec(s);
  if (thang) {
    const m = parseInt(thang[1]);
    const y = parseInt(thang[2]);
    return new Date(y, m, 0); // last day of month
  }
  // Fallback: 30 ngày từ now
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
}
