import { db } from "./db";
import { tokenizeKeywords } from "./legal-parser";

export interface RetrievedChunk {
  id: string;
  documentId: string;
  documentTitle: string;
  documentType: string;
  documentNumber: string;
  article: string | null;
  section: string | null;
  content: string;
  score: number;
}

/**
 * Keyword-based retrieval với TF-IDF style ranking.
 * Đơn giản, không cần embedding model. Đủ tốt cho corpus < 10K chunks.
 */
export async function retrieveRelevantChunks(
  query: string,
  topK = 5
): Promise<RetrievedChunk[]> {
  const keywords = tokenizeKeywords(query);
  if (keywords.length === 0) return [];

  // Lấy tối đa 1000 chunks active documents (M-7 fix: cap RAM)
  const chunks = await db.legalChunk.findMany({
    where: {
      document: { status: "active" },
    },
    include: {
      document: {
        select: { id: true, title: true, docType: true, docNumber: true, status: true },
      },
    },
    take: 1000,
  });

  if (chunks.length === 0) return [];

  // Score each chunk by keyword frequency
  const scored = chunks.map((c) => {
    const contentTokens = tokenizeKeywords(c.content);
    const tokenSet = new Set(contentTokens);
    let matched = 0;
    let totalScore = 0;

    for (const kw of keywords) {
      if (tokenSet.has(kw)) {
        matched++;
        // Count occurrences for TF
        const tf = contentTokens.filter((t) => t === kw).length;
        totalScore += 1 + Math.log(tf);
      }
    }

    // Boost if title matches
    const titleTokens = tokenizeKeywords(c.document.title);
    for (const kw of keywords) {
      if (titleTokens.includes(kw)) totalScore += 0.5;
    }

    // Coverage bonus
    const coverage = matched / keywords.length;
    const finalScore = totalScore * (0.5 + coverage * 0.5);

    return {
      id: c.id,
      documentId: c.documentId,
      documentTitle: c.document.title,
      documentType: c.document.docType,
      documentNumber: c.document.docNumber,
      article: c.article,
      section: c.section,
      content: c.content,
      score: finalScore,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.filter((c) => c.score > 0).slice(0, topK);
}

export const RAG_SYSTEM_PROMPT = `Bạn là trợ lý AI pháp lý cho Phòng Kinh Tế Xã Trần Phú, Hà Nội. Bạn hỗ trợ cán bộ phòng giải đáp các câu hỏi về pháp luật cho người dân, đặc biệt trong các lĩnh vực: đất đai, xây dựng, môi trường, công thương, nông nghiệp, tài chính - kế hoạch.

NGUYÊN TẮC TRẢ LỜI:
1. Trả lời bằng tiếng Việt, ngắn gọn, dễ hiểu cho cán bộ và người dân
2. Khi có văn bản tham chiếu, trích dẫn CHÍNH XÁC Điều/Khoản: "[Tên văn bản, Điều X, Khoản Y]"
3. Không suy đoán ngoài phạm vi văn bản được cung cấp
4. Nếu thông tin không đủ, nói rõ và khuyến nghị tham khảo văn bản chính thức
5. Ưu tiên dùng từ ngữ hành chính chuẩn mực`;

export function buildRAGUserMessage(query: string, chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return `Câu hỏi: ${query}

Hệ thống không tìm thấy văn bản pháp luật cụ thể nào liên quan đến câu hỏi này trong cơ sở dữ liệu của Phòng Kinh Tế. Hãy trả lời dựa trên kiến thức chung và khuyến nghị người dùng liên hệ Phòng Kinh Tế để được hướng dẫn chi tiết hoặc tham khảo văn bản chính thức từ cổng thông tin chinhphu.vn, hanoi.gov.vn.`;
  }

  const context = chunks
    .map((c, i) => {
      const ref = [c.article, c.section].filter(Boolean).join(", ");
      return `[Nguồn ${i + 1}] ${c.documentTitle} (${c.documentNumber})${ref ? " - " + ref : ""}:\n${c.content}`;
    })
    .join("\n\n---\n\n");

  return `VĂN BẢN PHÁP LUẬT THAM KHẢO:
${context}

CÂU HỎI: ${query}

Hãy trả lời câu hỏi dựa trên văn bản pháp luật tham khảo ở trên. Trích dẫn chính xác Điều/Khoản. Nếu nhiều nguồn, ghi rõ từng nguồn.`;
}

// Backward compat
export function buildRAGPrompt(query: string, chunks: RetrievedChunk[]): string {
  return RAG_SYSTEM_PROMPT + "\n\n" + buildRAGUserMessage(query, chunks);
}
