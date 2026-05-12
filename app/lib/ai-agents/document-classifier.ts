/**
 * Document Classifier Agent - Phase 2 AI Agent.
 *
 * Input: text của văn bản đến (đã extract từ PDF/DOCX)
 * Output:
 *   - Metadata structured (docType, docNumber, title, issuedDate, ...)
 *   - Classification (fields, urgency, summary, action items)
 *   - Routing recommendation (UBNDDirective | LegalDocument | Task)
 *   - Suggested department + cán bộ phụ trách
 *
 * Pattern hybrid:
 *   1. Rule-based fast path (regex + dictionary) — 0 cost
 *   2. LLM enhancement (Gemini Flash) — cho summary + action items + confidence boost
 *
 * Output schema validated bằng Zod để pipeline sau (UI/server action) an toàn.
 */
import { z } from "zod";
import { extractEntities, suggestDepartment, type FieldKey } from "@/lib/legal-entities";
import { parseVNLegalDocument } from "@/lib/vn-legal-parser";
import { getActiveProvider, streamChat } from "@/lib/ai";

// ============== OUTPUT SCHEMA ==============

export const ClassificationSchema = z.object({
  // Metadata core
  docType: z
    .enum(["LUAT", "NGHI_DINH", "THONG_TU", "QUYET_DINH", "NGHI_QUYET", "CONG_VAN", "OTHER"])
    .nullable(),
  docNumber: z.string().nullable(),
  title: z.string().nullable(),
  issuingBody: z.string().nullable(),
  issuedDate: z.string().nullable(), // YYYY-MM-DD
  effectiveDate: z.string().nullable(),

  // Classification
  fields: z.array(z.string()), // FieldKey enum keys
  urgency: z.enum(["KHAN_CAP", "CAO", "THUONG", "THAP"]),
  summary: z.string(),
  actionItems: z.array(
    z.object({
      action: z.string(),
      owner: z.string().nullable(),
      deadline: z.string().nullable(),
    })
  ),

  // Routing recommendation
  routing: z.enum(["UBND_DIRECTIVE", "LEGAL_DOCUMENT", "INTERNAL_TASK", "REVIEW_NEEDED"]),
  routingReason: z.string(),
  suggestedDept: z.string().nullable(),
  suggestedDeptConfidence: z.number().min(0).max(1),

  // Quality signals
  llmUsed: z.boolean(),
  warnings: z.array(z.string()),
});

export type Classification = z.infer<typeof ClassificationSchema>;

// ============== RULE-BASED CLASSIFIER (fast path) ==============

/**
 * Phân loại văn bản chỉ bằng regex + dictionary, không call LLM.
 * Dùng làm baseline + fallback.
 */
export function classifyByRules(text: string): Classification {
  const warnings: string[] = [];

  // 1. Metadata qua regex parser
  const parsed = parseVNLegalDocument(text);
  warnings.push(...parsed.warnings);

  // 2. Entity extraction
  const entities = extractEntities(text);
  const fields = entities.fields;

  // 3. Override docType dựa trên pattern docNumber (chống bug "Căn cứ NĐ...")
  // /UBND- → CONG_VAN bắt buộc
  // /QĐ-(UBND|TTg|...) → QUYẾT ĐỊNH
  // /NĐ-CP → NGHỊ ĐỊNH
  // /TT-* → THÔNG TƯ
  // /QH\d+ → LUẬT (Quốc hội)
  let finalDocType: string | null = parsed.docType;
  const docNum = parsed.docNumber || "";
  if (/\/UBND-/i.test(docNum) || /^\d+\/CV-/i.test(docNum)) {
    finalDocType = "CONG_VAN";
  } else if (/\/NĐ-CP\b/i.test(docNum)) {
    finalDocType = "NGHI_DINH";
  } else if (/\/TT-/i.test(docNum)) {
    finalDocType = "THONG_TU";
  } else if (/\/QĐ-/i.test(docNum)) {
    finalDocType = "QUYET_DINH";
  } else if (/\/QH\d+\b/i.test(docNum)) {
    finalDocType = "LUAT";
  } else if (/\/NQ-/i.test(docNum)) {
    finalDocType = "NGHI_QUYET";
  }

  // 4. Urgency
  const urgency = detectUrgency(text);

  // 5. Department suggest
  const deptSuggest = suggestDepartment(text);

  // 6. Routing decision
  const routing = decideRouting(finalDocType, entities, text);

  // 7. Summary (rule-based: dùng 1-2 dòng đầu sau header)
  // Tránh dùng parsed.title nếu nó nhiễu (chứa "Căn cứ" hoặc "Điều")
  let summary: string;
  if (
    parsed.title &&
    !parsed.title.toLowerCase().includes("căn cứ") &&
    !parsed.title.toLowerCase().includes("điều ")
  ) {
    summary = parsed.title;
  } else {
    summary = extractFirstParagraph(text) || parsed.title || "Chưa xác định nội dung";
  }

  return {
    docType: (finalDocType as any) || "OTHER",
    docNumber: parsed.docNumber,
    title: parsed.title,
    issuingBody: entities.issuingBodies[0] || null,
    issuedDate: parsed.issuedDate,
    effectiveDate: parsed.effectiveDate,
    fields: fields as string[],
    urgency,
    summary: summary.slice(0, 500),
    actionItems: [], // rule-based khó extract action item chính xác - để LLM xử lý
    routing: routing.type,
    routingReason: routing.reason,
    suggestedDept: deptSuggest.dept,
    suggestedDeptConfidence: deptSuggest.confidence,
    llmUsed: false,
    warnings,
  };
}

function detectUrgency(text: string): "KHAN_CAP" | "CAO" | "THUONG" | "THAP" {
  const lower = text.toLowerCase().slice(0, 5000); // chỉ check phần đầu để tránh false-positive
  if (
    /\b(khẩn|hỏa tốc|khẩn cấp|tuyệt mật)\b/.test(lower) ||
    /trước ngày \d{1,2}\/\d{1,2}/.test(lower)
  ) {
    return "KHAN_CAP";
  }
  if (/\b(ưu tiên cao|trọng điểm|đặc biệt|ngay)\b/.test(lower)) return "CAO";
  if (/\b(thường xuyên|định kỳ|hàng năm)\b/.test(lower)) return "THAP";
  return "THUONG";
}

function decideRouting(
  docType: string | null,
  entities: ReturnType<typeof extractEntities>,
  text: string
): { type: Classification["routing"]; reason: string } {
  // Văn bản pháp lý từ TW/Chính phủ → LEGAL_DOCUMENT
  if (
    docType === "LUAT" ||
    docType === "NGHI_DINH" ||
    docType === "THONG_TU" ||
    docType === "QUYET_DINH" ||
    docType === "NGHI_QUYET"
  ) {
    return {
      type: "LEGAL_DOCUMENT",
      reason: `Văn bản pháp lý (${docType}) → lưu vào kho văn bản tra cứu`,
    };
  }

  // Công văn UBND xã / huyện giao việc → UBND_DIRECTIVE
  if (docType === "CONG_VAN") {
    const hasUBND = entities.issuingBodies.some((b) => b.includes("UBND"));
    const hasAssignToVerb = /\b(yêu cầu|đề nghị|giao|chỉ đạo)\b/i.test(text);
    if (hasUBND && hasAssignToVerb) {
      return {
        type: "UBND_DIRECTIVE",
        reason: "Công văn UBND giao việc → tạo UBNDDirective + Task",
      };
    }
    return {
      type: "REVIEW_NEEDED",
      reason: "Công văn nhưng không rõ giao việc - cần TP review",
    };
  }

  return {
    type: "REVIEW_NEEDED",
    reason: "Không xác định được loại văn bản - cần TP review",
  };
}

function extractFirstParagraph(text: string): string | null {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  // Skip headers (IN HOA), tìm đoạn nội dung đầu tiên
  for (const line of lines.slice(0, 30)) {
    if (line.length > 40 && line !== line.toUpperCase() && !/^Số:|^Căn cứ/.test(line)) {
      return line;
    }
  }
  return null;
}

// ============== LLM-ENHANCED CLASSIFIER ==============

const LLM_SYSTEM_PROMPT = `Bạn là chuyên gia phân loại văn bản hành chính - pháp luật Việt Nam, hỗ trợ Phòng Kinh Tế UBND xã.

Nhiệm vụ: phân tích văn bản đầu vào và trả về JSON CHÍNH XÁC theo schema sau (không markdown, không giải thích):
{
  "summary": "<tóm tắt 2-3 câu rõ nội dung chính, mục đích>",
  "actionItems": [
    {
      "action": "<hành động cụ thể cần làm, không phải mô tả chung>",
      "owner": "<đơn vị/người chịu trách nhiệm, vd: 'Phòng Kinh Tế', 'cán bộ phụ trách môi trường'>" | null,
      "deadline": "<YYYY-MM-DD hoặc mô tả thời gian, vd: 'Quý I/2026'>" | null
    }
  ],
  "fieldsConfidence": <0.0 đến 1.0, mức độ tin cậy phân loại lĩnh vực>
}

QUY TẮC:
1. **summary**: tóm tắt ngắn (2-3 câu), nêu RÕ "ai làm gì cho ai" hoặc "quy định về gì". KHÔNG copy header.
2. **actionItems**: chỉ trích các hành động cụ thể, có động từ rõ (kiểm tra, báo cáo, phối hợp, tổ chức...). KHÔNG liệt kê căn cứ pháp lý.
3. **deadline**: cố gắng convert sang YYYY-MM-DD nếu có ngày cụ thể, hoặc giữ mô tả ("Quý 2/2026").
4. Nếu văn bản KHÔNG có action item (vd: nghị định, luật) → trả mảng rỗng [].
5. Trả null cho field không xác định, KHÔNG bịa.`;

const LLMOutputSchema = z.object({
  summary: z.string(),
  actionItems: z.array(
    z.object({
      action: z.string(),
      owner: z.string().nullable(),
      deadline: z.string().nullable(),
    })
  ),
  fieldsConfidence: z.number().min(0).max(1).default(0.8),
});

async function enhanceWithLLM(
  text: string,
  baseline: Classification
): Promise<Partial<Classification>> {
  const provider = getActiveProvider();
  if (!provider) return {};

  // Truncate text để tiết kiệm token: 4000 chars đầu + 1500 cuối
  const head = text.slice(0, 4000);
  const tail = text.length > 6000 ? "\n\n[...]\n\n" + text.slice(-1500) : "";
  const sample = head + tail;

  let aiResponse = "";
  try {
    await streamChat({
      provider,
      systemPrompt: LLM_SYSTEM_PROMPT,
      userMessage: `Văn bản phân tích:\n\n${sample}\n\nLưu ý: văn bản này đã được phân loại sơ bộ là loại "${baseline.docType}", lĩnh vực ${baseline.fields.join(", ") || "chưa rõ"}.\n\nTrả JSON.`,
      maxTokens: 1200,
      onChunk: (t) => {
        aiResponse += t;
      },
    });
  } catch (e: any) {
    return {
      warnings: [...baseline.warnings, `LLM enhancement fail: ${e?.message || "unknown"}`],
    };
  }

  // Parse JSON (LLM đôi khi trả kèm markdown)
  const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      warnings: [...baseline.warnings, "LLM trả về không có JSON hợp lệ"],
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const validated = LLMOutputSchema.parse(parsed);
    return {
      summary: validated.summary,
      actionItems: validated.actionItems,
    };
  } catch (e: any) {
    return {
      warnings: [...baseline.warnings, `LLM JSON parse fail: ${e?.message || "unknown"}`],
    };
  }
}

// ============== PUBLIC API ==============

/**
 * Phân loại văn bản đầy đủ (rule-based + LLM enhancement).
 *
 * @param text Toàn bộ nội dung text của văn bản (đã extract từ PDF/DOCX)
 * @param options.useLLM Có dùng LLM cải thiện không (default: true nếu có provider)
 */
export async function classifyDocument(
  text: string,
  options: { useLLM?: boolean } = {}
): Promise<Classification> {
  if (!text || text.length < 50) {
    throw new Error("Văn bản quá ngắn để phân loại (cần ít nhất 50 ký tự)");
  }

  // 1. Rule-based baseline (fast, free)
  const baseline = classifyByRules(text);

  // 2. LLM enhancement (slower, costs tokens)
  const useLLM = options.useLLM !== false && !!getActiveProvider();
  if (!useLLM) return baseline;

  const enhanced = await enhanceWithLLM(text, baseline);
  return {
    ...baseline,
    ...enhanced,
    llmUsed: true,
    warnings: enhanced.warnings || baseline.warnings,
  };
}
