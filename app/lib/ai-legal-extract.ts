// AI-powered metadata extraction cho văn bản pháp luật VN.
// Tận dụng AI provider (DeepSeek/Gemini/Claude) để parse chính xác hơn regex.

import { getActiveProvider, streamChat } from "./ai";
import { parseVNLegalDocument, type ParsedLegalMetadata, type VNDocType } from "./vn-legal-parser";

interface AIExtractedMetadata {
  docType: VNDocType | null;
  docNumber: string | null;
  title: string | null;
  issuedDate: string | null;
  effectiveDate: string | null;
  summary: string | null;
}

const SYSTEM_PROMPT = `Bạn là chuyên gia phân tích văn bản pháp luật Việt Nam. Nhiệm vụ: trích xuất metadata từ nội dung văn bản (đã extract từ PDF).

Trả lời CHÍNH XÁC dạng JSON, không có markdown, không có giải thích:
{
  "docType": "NGHI_DINH" | "THONG_TU" | "QUYET_DINH" | "LUAT" | "NGHI_QUYET" | "CONG_VAN" | null,
  "docNumber": "<số văn bản, vd: 78/2025/NĐ-CP>" | null,
  "title": "<tên/trích yếu của CHÍNH văn bản này, KHÔNG phải văn bản được căn cứ>" | null,
  "issuedDate": "YYYY-MM-DD" | null,
  "effectiveDate": "YYYY-MM-DD" | null,
  "summary": "<tóm tắt 1-2 câu nội dung chính>" | null
}

QUY TẮC QUAN TRỌNG:
1. **docType**: chỉ xác định LOẠI của văn bản hiện tại (thường ở header dạng IN HOA), BỎ QUA "Căn cứ Nghị định..." vì đó là văn bản tham chiếu.
2. **docNumber**: số chính thức của VĂN BẢN HIỆN TẠI (sau "Số:" trong vùng header), BỎ QUA số trong phần "Căn cứ". Nếu trống/dạng "Số: /XXX" → trả null.
3. **title**: tên văn bản hiện tại, thường nằm sau loại văn bản, trước phần "Căn cứ". Bỏ "(Ban hành kèm theo...)".
4. **issuedDate**: ngày của VĂN BẢN HIỆN TẠI ("[Nơi], ngày X tháng Y năm Z"), BỎ QUA ngày của các văn bản căn cứ.
5. **effectiveDate**: ngày hiệu lực (thường ở Điều cuối "có hiệu lực từ ngày..."). Nếu không có → trả null.
6. Trường nào không tìm được → trả null, KHÔNG bịa đặt.`;

export async function extractLegalMetadataWithAI(rawText: string): Promise<ParsedLegalMetadata> {
  // Fallback regex parser nếu AI không khả dụng
  const fallbackResult = parseVNLegalDocument(rawText);

  const provider = getActiveProvider();
  if (!provider) {
    fallbackResult.warnings.unshift("AI chưa cấu hình - dùng phương pháp pattern matching cơ bản.");
    return fallbackResult;
  }

  // Đưa cho AI: 6000 chars đầu (header + đầu nội dung) + 2000 chars cuối (Điều hiệu lực)
  const head = rawText.slice(0, 6000);
  const tail = rawText.length > 8000 ? "\n\n[...]\n\n" + rawText.slice(-2000) : "";
  const sample = head + tail;

  try {
    let aiResponse = "";
    await streamChat({
      provider,
      systemPrompt: SYSTEM_PROMPT,
      userMessage: `Văn bản cần phân tích:\n\n${sample}\n\nTrả JSON metadata.`,
      maxTokens: 800,
      onChunk: (text) => {
        aiResponse += text;
      },
    });

    // Strip markdown code fence nếu có
    const cleaned = aiResponse
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned) as AIExtractedMetadata;

    const warnings: string[] = [];
    if (!parsed.docType) warnings.push("AI không xác định được loại văn bản.");
    if (!parsed.docNumber) warnings.push("AI không tìm thấy số văn bản.");
    if (!parsed.title) warnings.push("AI không trích được tên văn bản.");
    if (!parsed.issuedDate) warnings.push("AI không tìm thấy ngày ban hành.");
    if (!parsed.effectiveDate) {
      warnings.push("Không có ngày hiệu lực - tạm dùng ngày ban hành.");
    }

    return {
      docType: parsed.docType,
      docNumber: parsed.docNumber,
      title: parsed.title,
      issuedDate: parsed.issuedDate,
      effectiveDate: parsed.effectiveDate || parsed.issuedDate,
      summary: parsed.summary,
      fullText: rawText,
      warnings,
    };
  } catch (e: any) {
    // Lỗi AI → dùng fallback regex
    fallbackResult.warnings.unshift(
      "AI trích xuất gặp lỗi - dùng phương pháp pattern matching dự phòng."
    );
    return fallbackResult;
  }
}
