/**
 * Speech Writer Agent - Phase 4 AI Agent.
 *
 * Nhiệm vụ: viết bài phát biểu cho Trưởng phòng dựa trên:
 *   - Topic / chủ đề
 *   - Occasion (sơ kết, khai mạc, tổng kết...)
 *   - Audience (cán bộ phòng, UBND, công dân...)
 *   - Legal references (auto retrieve qua RAG hoặc TP cung cấp)
 *   - Style hint (formal, ngắn, dẫn chiếu nhiều...)
 *
 * Output:
 *   - Bài phát biểu 500-1500 từ
 *   - Cấu trúc: greeting → mở đầu → nội dung chính → kết luận
 *   - Inline citations [1], [2] cho legal refs
 *   - Suggested edit points cho TP
 */
import { getActiveProvider, streamChat } from "@/lib/ai";
import { answerLegalQuery, type LegalCitation } from "./legal-researcher";

// ============== TYPES ==============

export type SpeechOccasion =
  | "so_ket" // sơ kết
  | "tong_ket" // tổng kết năm
  | "khai_mac" // khai mạc hội nghị
  | "be_mac" // bế mạc
  | "giao_ban" // họp giao ban
  | "trien_khai" // triển khai văn bản
  | "khen_thuong" // khen thưởng
  | "tong_quat"; // chung

export type SpeechAudience =
  | "lanh_dao" // họp với lãnh đạo cấp trên
  | "phong" // họp nội bộ phòng
  | "lien_phong" // họp liên phòng
  | "ubnd" // UBND xã
  | "cong_dan" // dân
  | "doan_kiem_tra"; // đoàn kiểm tra

export type SpeechLength = "ngan" | "vua" | "dai"; // 300/700/1300 từ

export interface SpeechInput {
  occasion: SpeechOccasion;
  audience: SpeechAudience;
  length: SpeechLength;
  topic: string; // ví dụ "Sơ kết công tác bảo vệ môi trường năm 2026"
  /** Bối cảnh thêm (số liệu, sự kiện gần đây) */
  context?: string;
  /** Có auto RAG legal references không (default true) */
  autoLegalSearch?: boolean;
  /** Citations user tự cung cấp (skip RAG) */
  manualCitations?: LegalCitation[];
}

export interface SpeechResult {
  /** Toàn văn bài phát biểu */
  speech: string;
  /** Outline cấu trúc bài */
  outline: string[];
  /** Citations dùng trong bài */
  citations: LegalCitation[];
  /** Đề xuất TP chỉnh sửa */
  suggestedEdits: string[];
  /** Warnings */
  warnings: string[];
  /** Word count thực tế */
  wordCount: number;
}

// ============== LABELS ==============

const OCCASION_LABELS: Record<SpeechOccasion, string> = {
  so_ket: "Sơ kết / báo cáo định kỳ",
  tong_ket: "Tổng kết năm / nhiệm kỳ",
  khai_mac: "Khai mạc hội nghị / sự kiện",
  be_mac: "Bế mạc hội nghị",
  giao_ban: "Họp giao ban",
  trien_khai: "Triển khai văn bản chỉ đạo",
  khen_thuong: "Khen thưởng / biểu dương",
  tong_quat: "Phát biểu chung",
};

const AUDIENCE_LABELS: Record<SpeechAudience, string> = {
  lanh_dao: "Lãnh đạo cấp trên (UBND xã, HĐND)",
  phong: "Cán bộ trong Phòng Kinh Tế",
  lien_phong: "Cán bộ liên phòng ban",
  ubnd: "Hội nghị UBND xã",
  cong_dan: "Nhân dân / công dân địa phương",
  doan_kiem_tra: "Đoàn kiểm tra cấp huyện/tỉnh",
};

const LENGTH_WORDS: Record<SpeechLength, number> = {
  ngan: 300,
  vua: 700,
  dai: 1300,
};

// ============== AUDIENCE-SPECIFIC GREETING ==============

function getGreetingHint(audience: SpeechAudience): string {
  switch (audience) {
    case "lanh_dao":
      return 'Mở đầu trang trọng: "Kính thưa các đồng chí lãnh đạo / Kính thưa Hội nghị"';
    case "phong":
      return 'Mở đầu thân mật: "Thưa các đồng chí trong phòng"';
    case "ubnd":
      return 'Mở đầu trang trọng: "Kính thưa đồng chí Chủ tịch UBND xã / Kính thưa Hội nghị"';
    case "cong_dan":
      return 'Mở đầu lịch sự gần gũi: "Kính thưa bà con / Thưa toàn thể nhân dân"';
    case "doan_kiem_tra":
      return 'Mở đầu trang trọng: "Kính thưa đồng chí Trưởng đoàn / Kính thưa các đồng chí thành viên đoàn kiểm tra"';
    default:
      return 'Mở đầu trang trọng: "Kính thưa các đồng chí"';
  }
}

// ============== OUTLINE GENERATION ==============

const OUTLINE_PROMPT = `Bạn là chuyên gia viết bài phát biểu hành chính Việt Nam, đang giúp Trưởng phòng Kinh Tế xã chuẩn bị bài phát biểu.

Nhiệm vụ: Tạo OUTLINE (dàn ý) ngắn gọn cho bài phát biểu sắp viết.

Quy tắc:
- 4-6 mục, mỗi mục 1 dòng ngắn
- Cấu trúc phù hợp với occasion:
  * so_ket / tong_ket: Mở đầu → Thành tích → Hạn chế → Phương hướng → Cảm ơn
  * khai_mac: Mở đầu → Bối cảnh → Ý nghĩa hội nghị → Đề nghị → Tuyên bố khai mạc
  * trien_khai: Mở đầu → Tóm tắt nội dung văn bản → Phân công → Đề nghị thực hiện
  * giao_ban: Mở đầu → Kiểm điểm tuần qua → Nhiệm vụ tuần tới → Trao đổi → Kết luận
  * khen_thuong: Mở đầu → Ghi nhận thành tích → Tuyên dương → Trao tặng → Động viên
- Sử dụng ngôn ngữ hành chính trang trọng tiếng Việt

Trả về JSON THUẦN (không markdown):
{
  "outline": ["mục 1", "mục 2", "mục 3", ...]
}`;

async function generateOutline(input: SpeechInput): Promise<string[]> {
  const provider = getActiveProvider();
  if (!provider) {
    // Fallback outline cứng
    return getDefaultOutline(input.occasion);
  }

  const userMsg = `Chuẩn bị bài phát biểu:
- Chủ đề: ${input.topic}
- Loại: ${OCCASION_LABELS[input.occasion]}
- Đối tượng nghe: ${AUDIENCE_LABELS[input.audience]}
- Độ dài: ~${LENGTH_WORDS[input.length]} từ
${input.context ? `- Bối cảnh thêm: ${input.context.slice(0, 500)}` : ""}

Trả JSON outline.`;

  let response = "";
  try {
    await streamChat({
      provider,
      systemPrompt: OUTLINE_PROMPT,
      userMessage: userMsg,
      maxTokens: 500,
      onChunk: (t) => (response += t),
    });
  } catch {
    return getDefaultOutline(input.occasion);
  }

  const parsed = parseJsonResponse(response);
  if (!parsed?.outline || !Array.isArray(parsed.outline)) {
    return getDefaultOutline(input.occasion);
  }
  return parsed.outline.filter((s: any) => typeof s === "string" && s.length > 5).slice(0, 6);
}

function getDefaultOutline(occasion: SpeechOccasion): string[] {
  const presets: Record<SpeechOccasion, string[]> = {
    so_ket: ["Mở đầu - cảm ơn", "Báo cáo kết quả", "Đánh giá ưu nhược", "Phương hướng tới", "Kết luận"],
    tong_ket: ["Mở đầu", "Tổng quan năm", "Thành tích nổi bật", "Hạn chế", "Phương hướng năm tới", "Cảm ơn"],
    khai_mac: ["Mở đầu", "Bối cảnh tổ chức", "Ý nghĩa hội nghị", "Đề nghị thảo luận", "Tuyên bố khai mạc"],
    be_mac: ["Cảm ơn đại biểu", "Tóm tắt kết quả hội nghị", "Cam kết triển khai", "Tuyên bố bế mạc"],
    giao_ban: ["Mở đầu", "Kiểm điểm tuần qua", "Nhiệm vụ tuần mới", "Trao đổi vướng mắc", "Kết luận"],
    trien_khai: ["Mở đầu", "Tóm tắt văn bản chỉ đạo", "Yêu cầu cấp trên", "Phân công thực hiện", "Đề nghị triển khai"],
    khen_thuong: ["Mở đầu", "Ghi nhận thành tích", "Tuyên dương cụ thể", "Trao tặng", "Động viên cán bộ"],
    tong_quat: ["Mở đầu", "Nội dung chính", "Đề nghị", "Kết luận"],
  };
  return presets[occasion] || presets.tong_quat;
}

// ============== MAIN SPEECH GENERATION ==============

function buildSpeechPrompt(input: SpeechInput, outline: string[], citations: LegalCitation[]): string {
  const targetWords = LENGTH_WORDS[input.length];
  const greetingHint = getGreetingHint(input.audience);

  const citationContext =
    citations.length > 0
      ? `\n\nCác văn bản pháp lý có thể trích dẫn (dùng [1] [2] inline trong bài):\n` +
        citations
          .map(
            (c, i) =>
              `[${i + 1}] ${c.docNumber}${c.article ? " " + c.article : ""} - ${c.docTitle}\n    "${c.excerpt}"`
          )
          .join("\n")
      : "";

  // Single-purpose prompt: CHỈ sinh speech, không kèm metadata.
  // Metadata (edits, warnings) sẽ được gọi LLM call 2 trên speech kết quả.
  return `Bạn là chuyên gia viết bài phát biểu hành chính tiếng Việt, viết thay Trưởng phòng Kinh Tế xã Trần Phú.

NHIỆM VỤ: Viết bài phát biểu HOÀN CHỈNH dài khoảng ${targetWords} từ tiếng Việt.

📋 Thông tin:
- Chủ đề: ${input.topic}
- Loại: ${OCCASION_LABELS[input.occasion]}
- Đối tượng nghe: ${AUDIENCE_LABELS[input.audience]}
- ĐỘ DÀI BẮT BUỘC: ${Math.round(targetWords * 0.85)}-${Math.round(targetWords * 1.15)} từ. PHẢI tự đếm từ trước khi kết thúc. Nếu chưa đủ → viết thêm nội dung phân tích/đề xuất/cảm ơn.
${input.context ? `- Bối cảnh/số liệu: ${input.context.slice(0, 800)}` : ""}

📐 Cấu trúc bài (phải có đủ ${outline.length} phần, mỗi phần 2-3 đoạn):
${outline.map((s, i) => `${i + 1}. ${s}`).join("\n")}

✏️ Văn phong:
- ${greetingHint}
- Trang trọng phong cách hành chính nhà nước Việt Nam
- Mỗi đoạn 3-5 câu (~50-80 từ)
- Có inline citation [N] khi viện dẫn văn bản pháp luật
- Câu kết bài: cảm ơn ngắn gọn
${citationContext}

⚠️ KHÔNG:
- KHÔNG bịa số liệu hay văn bản pháp luật ngoài citations cung cấp
- KHÔNG dùng markdown headers (## **)
- KHÔNG tạo outline trong response - viết TRỰC TIẾP bài phát biểu

⚠️ TRẢ VỀ: CHỈ VĂN BẢN BÀI PHÁT BIỂU. Bắt đầu ngay bằng "Kính thưa..." hoặc "Thưa các đồng chí...". KHÔNG có introduction ngoài bài.`;
}

const CRITIQUE_PROMPT = `Bạn là chuyên gia review bài phát biểu hành chính.

Đánh giá bài phát biểu sau và đưa ra:
1. Gợi ý chỉnh sửa cụ thể cho Trưởng phòng (3-5 gợi ý ngắn, mỗi gợi ý 1 câu)
2. Cảnh báo nếu có (vd: thiếu số liệu cụ thể, văn bản pháp luật trích sai...)

Trả JSON THUẦN (không markdown):
{
  "suggestedEdits": ["...", "..."],
  "warnings": ["..."]
}`;

async function critiqueSpeech(speech: string, input: SpeechInput): Promise<{
  edits: string[];
  warnings: string[];
}> {
  const provider = getActiveProvider();
  if (!provider) return { edits: [], warnings: [] };

  let response = "";
  try {
    await streamChat({
      provider,
      systemPrompt: CRITIQUE_PROMPT,
      userMessage: `Chủ đề bài: "${input.topic}"
Đối tượng: ${AUDIENCE_LABELS[input.audience]}
Độ dài target: ~${LENGTH_WORDS[input.length]} từ, độ dài thực tế: ${countWords(speech)} từ

Bài phát biểu:
${speech}

Trả JSON.`,
      maxTokens: 500,
      onChunk: (t) => (response += t),
    });
  } catch {
    return { edits: [], warnings: [] };
  }

  const parsed = parseJsonResponse(response);
  return {
    edits: Array.isArray(parsed?.suggestedEdits) ? parsed.suggestedEdits.map(String).slice(0, 5) : [],
    warnings: Array.isArray(parsed?.warnings) ? parsed.warnings.map(String).slice(0, 5) : [],
  };
}

// ============== PUBLIC API ==============

/**
 * Sinh bài phát biểu hoàn chỉnh.
 */
export async function generateSpeech(input: SpeechInput): Promise<SpeechResult> {
  const provider = getActiveProvider();
  if (!provider) {
    return {
      speech: "AI provider chưa cấu hình.",
      outline: [],
      citations: [],
      suggestedEdits: [],
      warnings: ["AI provider unavailable"],
      wordCount: 0,
    };
  }

  // 1. Sinh outline
  const outline = await generateOutline(input);

  // 2. Lấy citations
  let citations: LegalCitation[] = input.manualCitations || [];
  if (citations.length === 0 && input.autoLegalSearch !== false) {
    try {
      const research = await answerLegalQuery(input.topic);
      citations = research.citations.slice(0, 5); // cap 5 cho khỏi loãng
    } catch (e) {
      console.warn("[speech-writer] auto legal search fail:", e);
    }
  }

  // 3. Generate speech
  const prompt = buildSpeechPrompt(input, outline, citations);

  let response = "";
  try {
    await streamChat({
      provider,
      systemPrompt: "",
      userMessage: prompt,
      // Tiếng Việt: ~1.5 token/word. +50% buffer cho prompt header etc.
      maxTokens: Math.min(8000, Math.max(2000, Math.round(LENGTH_WORDS[input.length] * 3))),
      onChunk: (t) => (response += t),
    });
  } catch (e: any) {
    return {
      speech: `Lỗi sinh bài phát biểu: ${e?.message || "unknown"}`,
      outline,
      citations,
      suggestedEdits: [],
      warnings: ["LLM call failed"],
      wordCount: 0,
    };
  }

  // Response là raw speech text (không JSON wrapper)
  // Clean up: bỏ markdown headers, ```, leading "Bài phát biểu:" labels
  const speech = response
    .trim()
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/```\s*$/i, "")
    .replace(/^(bài phát biểu|nội dung|speech)[\s:]*/i, "")
    .trim();

  if (!speech || speech.length < 100) {
    return {
      speech: response.slice(0, 8000) || "Không sinh được bài phát biểu",
      outline,
      citations,
      suggestedEdits: [],
      warnings: ["Bài phát biểu quá ngắn - thử lại với chủ đề chi tiết hơn"],
      wordCount: countWords(response),
    };
  }

  // Call 2: critique (best-effort)
  const critique = await critiqueSpeech(speech, input);

  return {
    speech,
    outline,
    citations,
    suggestedEdits: critique.edits,
    warnings: critique.warnings,
    wordCount: countWords(speech),
  };
}

// ============== HELPERS ==============

function parseJsonResponse(text: string): any | null {
  if (!text) return null;
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter((w) => w.length > 0).length;
}

// ============== EXPORTS ==============

export { OCCASION_LABELS, AUDIENCE_LABELS, LENGTH_WORDS };
