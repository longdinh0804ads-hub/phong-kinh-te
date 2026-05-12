/**
 * Legal Researcher Agent - Phase 3 AI Agent.
 *
 * Nhiệm vụ: tra cứu pháp lý nâng cao với multi-hop reasoning.
 *
 * Pipeline:
 *   1. Query decomposition (LLM): "câu hỏi phức tạp" → 1-3 sub-queries
 *   2. Per sub-query: entity-boosted RAG → top chunks + articles
 *   3. Merge results, dedup, rank
 *   4. LLM synthesize answer với inline citation [docNumber, Điều X]
 *   5. Trả về structured response: answer + citations + confidence
 *
 * Khác biệt so với simple RAG hiện tại:
 *   - Đa câu hỏi con: vd "So sánh trách nhiệm UBND xã về môi trường và ATTP"
 *     → query 1: "trách nhiệm UBND xã về môi trường"
 *     → query 2: "trách nhiệm UBND xã về ATTP"
 *   - Self-check: detect missing/contradictory info trong context
 *   - Cite có cấu trúc: trả về list citations để UI render footnote
 */
import { z } from "zod";
import { retrieveWithArticleExpansion } from "@/lib/rag-article-expansion";
import { getActiveProvider, streamChat } from "@/lib/ai";
import { extractEntities } from "@/lib/legal-entities";

// ============== SCHEMAS ==============

export interface LegalCitation {
  docNumber: string;
  docTitle: string;
  article: string | null;
  excerpt: string; // 200 chars đầu của chunk relevant
}

export interface LegalAnswer {
  /** Câu trả lời tổng hợp, có inline citation dạng [1], [2] */
  answer: string;
  /** Danh sách citation tương ứng số trong answer */
  citations: LegalCitation[];
  /** Sub-queries đã decompose */
  subQueries: string[];
  /** AI confidence (low/medium/high) - low = câu hỏi không tìm được đủ context */
  confidence: "low" | "medium" | "high";
  /** Cảnh báo nếu có (vd "Văn bản đã bị thay thế bởi VB mới") */
  warnings: string[];
}

// ============== QUERY DECOMPOSITION ==============

const DECOMPOSE_PROMPT = `Bạn là chuyên gia phân tích câu hỏi pháp lý.

Nhiệm vụ: phân tách 1 câu hỏi (có thể phức tạp, đa chiều) thành các sub-query đơn giản hơn để tra cứu chính xác.

Quy tắc:
- Tối đa 3 sub-query
- Mỗi sub-query là 1 mệnh đề tra cứu rõ ràng, độc lập
- Nếu câu hỏi đã đơn giản → trả mảng 1 phần tử = câu gốc
- KHÔNG paraphrase quá khác, giữ keywords pháp lý gốc (vd "Điều 24", "Nghị định 13/2023")

Trả JSON ĐÚNG cấu trúc:
{
  "subQueries": ["sub-query 1", "sub-query 2"],
  "reasoning": "<lý do phân tách 1 dòng>"
}

Ví dụ:
- Input: "So sánh trách nhiệm của UBND xã về môi trường và ATTP"
- Output: {"subQueries": ["trách nhiệm UBND xã về môi trường", "trách nhiệm UBND xã về an toàn thực phẩm"], "reasoning": "câu hỏi so sánh 2 lĩnh vực"}

- Input: "Thủ tục cấp giấy phép xây dựng nhà ở"
- Output: {"subQueries": ["thủ tục cấp giấy phép xây dựng nhà ở riêng lẻ"], "reasoning": "câu đơn"}

KHÔNG markdown, KHÔNG giải thích thêm.`;

async function decomposeQuery(
  query: string
): Promise<{ subQueries: string[]; reasoning: string }> {
  const provider = getActiveProvider();
  if (!provider) return { subQueries: [query], reasoning: "AI provider unavailable" };

  let response = "";
  try {
    await streamChat({
      provider,
      systemPrompt: DECOMPOSE_PROMPT,
      userMessage: `Câu hỏi: "${query}"\nTrả JSON.`,
      maxTokens: 300,
      onChunk: (t) => (response += t),
    });
  } catch (e: any) {
    return { subQueries: [query], reasoning: `LLM fail: ${e?.message}` };
  }

  const parsed = parseJsonResponse(response);
  if (!parsed) return { subQueries: [query], reasoning: "no-json" };
  const sq = Array.isArray(parsed.subQueries)
    ? parsed.subQueries.filter((s: any) => typeof s === "string" && s.length > 5)
    : [];
  if (sq.length === 0) return { subQueries: [query], reasoning: "empty-decompose" };
  return { subQueries: sq.slice(0, 3), reasoning: parsed.reasoning || "" };
}

// ============== ANSWER SYNTHESIS ==============

const SYNTHESIS_PROMPT = `Bạn là chuyên gia pháp lý hành chính Việt Nam, đang hỗ trợ Trưởng phòng Kinh Tế xã.

Nhiệm vụ: dựa trên các Điều luật/khoản pháp lý được cung cấp, trả lời câu hỏi của Trưởng phòng.

QUY TẮC NGHIÊM:
1. CHỈ trích dẫn từ context cung cấp - KHÔNG bịa số điều/khoản.
2. Mỗi luận điểm phải có citation dạng [N] trong câu, với N là index của citation trong list dưới.
3. Trả lời ngắn gọn (5-15 câu), cấu trúc dễ đọc cho lãnh đạo:
   - Mở đầu: tóm tắt 1 câu
   - Thân: các điểm chính có cite
   - Kết: hành động đề xuất (nếu có thể)
4. Đánh giá confidence:
   - "high": câu hỏi được trả lời trực tiếp từ context, đủ thông tin
   - "medium": câu hỏi được trả lời 1 phần, context có liên quan nhưng không hoàn toàn match
   - "low": context KHÔNG trực tiếp trả lời câu hỏi (vd câu hỏi về visa nhưng context chỉ có VB tổ chức cơ quan)
     → answer phải ngắn (1-3 câu) và nói rõ "Không tìm thấy quy định trực tiếp về [topic]. Đề nghị hỏi cụ thể hơn hoặc upload thêm văn bản."
5. Nếu văn bản đã hết hiệu lực/bị thay thế → cảnh báo trong "warnings".

QUAN TRỌNG: Trả về CHỈ JSON thuần (không markdown, không \`\`\`json wrapper). Format:
{
  "answer": "<câu trả lời có [1] [2] inline>",
  "usedCitations": [1, 2],
  "confidence": "low" | "medium" | "high",
  "warnings": []
}`;

interface SynthInput {
  query: string;
  subQueries: string[];
  retrievedArticles: Array<{
    n: number; // index dùng làm citation
    docNumber: string;
    docTitle: string;
    article: string | null;
    content: string;
  }>;
}

async function synthesizeAnswer(input: SynthInput): Promise<{
  answer: string;
  usedCitations: number[];
  confidence: "low" | "medium" | "high";
  warnings: string[];
}> {
  const provider = getActiveProvider();
  if (!provider) {
    return {
      answer: "AI provider chưa cấu hình, không thể tổng hợp câu trả lời.",
      usedCitations: [],
      confidence: "low",
      warnings: ["AI provider unavailable"],
    };
  }

  // Build context
  const ctxParts = input.retrievedArticles.map(
    (a) =>
      `[${a.n}] ${a.docNumber}${a.article ? " " + a.article : ""} - ${a.docTitle}\n${a.content.slice(0, 2000)}`
  );

  const userMsg = `Câu hỏi gốc của Trưởng phòng: "${input.query}"

Các điều/khoản pháp lý liên quan (đã filter):

${ctxParts.join("\n\n---\n\n")}

Trả JSON answer.`;

  let response = "";
  try {
    await streamChat({
      provider,
      systemPrompt: SYNTHESIS_PROMPT,
      userMessage: userMsg,
      maxTokens: 1500,
      onChunk: (t) => (response += t),
    });
  } catch (e: any) {
    return {
      answer: "Lỗi gọi AI: " + (e?.message || "unknown"),
      usedCitations: [],
      confidence: "low",
      warnings: ["LLM call failed"],
    };
  }

  const parsed = parseJsonResponse(response);
  if (!parsed) {
    return {
      answer: response.slice(0, 2000) || "Không sinh được câu trả lời",
      usedCitations: [],
      confidence: "low",
      warnings: ["LLM không trả JSON đúng cấu trúc"],
    };
  }

  return {
    answer: String(parsed.answer || "Không có câu trả lời"),
    usedCitations: Array.isArray(parsed.usedCitations)
      ? parsed.usedCitations.filter((n: any) => typeof n === "number")
      : [],
    confidence: ["low", "medium", "high"].includes(parsed.confidence)
      ? parsed.confidence
      : "medium",
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [],
  };
}

/**
 * Robust JSON extraction từ LLM response:
 * - Strip markdown code fence (```json ... ```)
 * - Strip leading/trailing text
 * - Try parse, return null nếu fail
 */
function parseJsonResponse(text: string): any | null {
  if (!text) return null;
  // Strip markdown code fence
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();
  // Tìm object {} đầu tiên
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const jsonStr = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

// ============== PUBLIC API ==============

/**
 * Trả lời câu hỏi pháp lý với multi-hop reasoning + citation.
 *
 * @param query Câu hỏi của TP (tiếng Việt)
 * @param options.maxArticlesPerSubQuery Số Điều lấy mỗi sub-query (default 3)
 */
export async function answerLegalQuery(
  query: string,
  options: { maxArticlesPerSubQuery?: number } = {}
): Promise<LegalAnswer> {
  if (!query || query.trim().length < 5) {
    return {
      answer: "Câu hỏi quá ngắn",
      citations: [],
      subQueries: [],
      confidence: "low",
      warnings: ["Query too short"],
    };
  }

  const maxArt = options.maxArticlesPerSubQuery || 3;

  // 1. Decompose
  const { subQueries } = await decomposeQuery(query);

  // 2. Retrieve cho mỗi sub-query, dedup theo (docNumber + article)
  const seen = new Set<string>();
  const allArticles: Array<{
    n: number;
    docNumber: string;
    docTitle: string;
    article: string | null;
    content: string;
  }> = [];
  let citationIdx = 1;

  for (const sq of subQueries) {
    const articles = await retrieveWithArticleExpansion(sq, maxArt);
    for (const a of articles) {
      const key = `${a.documentNumber}::${a.article || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      allArticles.push({
        n: citationIdx++,
        docNumber: a.documentNumber,
        docTitle: a.documentTitle,
        article: a.article,
        content: a.chunks.map((c) => c.content).join("\n"),
      });
    }
  }

  // 3. Synthesize
  if (allArticles.length === 0) {
    return {
      answer: `Không tìm thấy văn bản pháp lý liên quan đến: "${query}". Vui lòng kiểm tra từ khóa hoặc upload thêm văn bản vào hệ thống.`,
      citations: [],
      subQueries,
      confidence: "low",
      warnings: [],
    };
  }

  const synth = await synthesizeAnswer({ query, subQueries, retrievedArticles: allArticles });

  // 4. Filter citations theo những cái LLM thực sự dùng
  const citationMap = new Map(allArticles.map((a) => [a.n, a]));
  const citations: LegalCitation[] = synth.usedCitations
    .map((n) => citationMap.get(n))
    .filter((a): a is NonNullable<typeof a> => !!a)
    .map((a) => ({
      docNumber: a.docNumber,
      docTitle: a.docTitle,
      article: a.article,
      excerpt: a.content.slice(0, 200),
    }));

  // Nếu LLM không trả usedCitations → dùng all để show
  const finalCitations = citations.length > 0 ? citations : allArticles.slice(0, 5).map((a) => ({
    docNumber: a.docNumber,
    docTitle: a.docTitle,
    article: a.article,
    excerpt: a.content.slice(0, 200),
  }));

  return {
    answer: synth.answer,
    citations: finalCitations,
    subQueries,
    confidence: synth.confidence,
    warnings: synth.warnings,
  };
}
