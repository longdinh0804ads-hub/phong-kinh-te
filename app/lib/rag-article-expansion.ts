// Article expansion: sau khi hybrid retrieve top-N chunks,
// tự động pull TOÀN BỘ chunks của các Điều "trúng", ghép lại để LLM thấy đầy đủ.
//
// Đặc thù VBPL: hỏi 1 câu thường liên quan tới CẢ ĐIỀU chứ không chỉ 1 Khoản đơn lẻ.
// Pipeline:
//   1. retrieveHybrid → top-12 candidate chunks
//   2. Group theo (documentId, article), tính aggregate score
//   3. Pick top-3 articles
//   4. Pull FULL Điều (tất cả Khoản) cho từng article
//   5. Trả về danh sách "ArticleGroup" thay vì chunks rời rạc

import { db } from "./db";
import { retrieveHybrid } from "./rag-hybrid";

export interface ArticleGroup {
  documentId: string;
  documentTitle: string;
  documentNumber: string;
  documentType: string;
  article: string | null; // "Điều 4" hoặc null nếu chunks không có article
  /** Tất cả chunks thuộc Điều này (đã sort theo chunkIndex) */
  chunks: Array<{
    section: string | null;
    point: string | null;
    content: string;
    chunkIndex: number;
  }>;
  /** Số chunks trong top-N hybrid trúng article này */
  matchedCount: number;
  /** Aggregate score = sum of chunk scores trong top-N */
  aggregateScore: number;
  /** Score cao nhất của 1 chunk trong article */
  maxChunkScore: number;
}

const CANDIDATE_K = 15; // Lấy nhiều candidate hơn để expansion
const MAX_ARTICLES = 3; // Pull tối đa 3 Điều full
const MAX_TOTAL_CHARS = 20000; // Cap context size (Gemini Flash 1M token, dư sức)
const MAX_CHUNKS_PER_ARTICLE = 25; // Cap số Khoản 1 Điều để tránh Điều siêu dài nuốt budget
const ALWAYS_INCLUDE_TOP_N = 3; // Top-3 articles luôn được include kể cả vượt budget nhẹ

/**
 * Hybrid retrieve + article expansion. Trả về top articles với FULL chunks.
 */
export async function retrieveWithArticleExpansion(
  query: string,
  maxArticles = MAX_ARTICLES
): Promise<ArticleGroup[]> {
  const candidates = await retrieveHybrid(query, CANDIDATE_K);
  if (candidates.length === 0) return [];

  // Group theo (documentId, article)
  type Bucket = {
    documentId: string;
    documentTitle: string;
    documentNumber: string;
    documentType: string;
    article: string | null;
    matchedChunkIds: Set<string>;
    matchedCount: number;
    aggregateScore: number;
    maxChunkScore: number;
  };
  const buckets = new Map<string, Bucket>();

  for (const c of candidates) {
    // Chunks không có article (text không cấu trúc) → mỗi chunk thành 1 bucket riêng
    const articleKey = c.article || `__no_article__${c.id}`;
    const key = `${c.documentId}::${articleKey}`;
    let b = buckets.get(key);
    if (!b) {
      b = {
        documentId: c.documentId,
        documentTitle: c.documentTitle,
        documentNumber: c.documentNumber,
        documentType: c.documentType,
        article: c.article,
        matchedChunkIds: new Set(),
        matchedCount: 0,
        aggregateScore: 0,
        maxChunkScore: 0,
      };
      buckets.set(key, b);
    }
    b.matchedChunkIds.add(c.id);
    b.matchedCount++;
    b.aggregateScore += c.score;
    if (c.score > b.maxChunkScore) b.maxChunkScore = c.score;
  }

  // Sort buckets: ưu tiên thuần theo maxChunkScore (chunk match mạnh nhất),
  // tie-break bằng matchedCount.
  // KHÔNG dùng sum aggregate hoặc count multiplier — sẽ bias các Điều dạng "listing"
  // (như Điều 8 NĐ-150 có 13 Khoản, mỗi Khoản 1 Sở) thắng các Điều "definition" ngắn
  // (như Điều 3 chỉ 1 chunk nhưng định nghĩa chính xác câu hỏi).
  const sortedBuckets = Array.from(buckets.values()).sort((a, b) => {
    const diff = b.maxChunkScore - a.maxChunkScore;
    if (Math.abs(diff) > 0.005) return diff;
    return b.matchedCount - a.matchedCount;
  });

  // Lấy top-K articles
  const topBuckets = sortedBuckets.slice(0, maxArticles);

  // Pull FULL chunks cho từng article (tận dụng index nên rất nhanh)
  const result: ArticleGroup[] = [];
  let totalChars = 0;

  for (const b of topBuckets) {
    let allChunks: Array<{
      section: string | null;
      point: string | null;
      content: string;
      chunkIndex: number;
    }>;

    if (b.article && !b.article.startsWith("__no_article__")) {
      // Pull tất cả chunks của Điều này
      const dbChunks = await db.legalChunk.findMany({
        where: { documentId: b.documentId, article: b.article },
        orderBy: { chunkIndex: "asc" },
        select: {
          chunkIndex: true,
          section: true,
          point: true,
          content: true,
        },
      });
      // Cap số chunks: nếu Điều quá dài (vd Điều 4 NĐ-100/2024 có 50+ Khoản),
      // ưu tiên giữ header + những chunks gần với chunks đã match.
      allChunks =
        dbChunks.length <= MAX_CHUNKS_PER_ARTICLE
          ? dbChunks
          : dbChunks.slice(0, MAX_CHUNKS_PER_ARTICLE);
    } else {
      // Article null → chỉ dùng chunk gốc đã match (không expand)
      const dbChunk = await db.legalChunk.findUnique({
        where: { id: Array.from(b.matchedChunkIds)[0] },
        select: {
          chunkIndex: true,
          section: true,
          point: true,
          content: true,
        },
      });
      allChunks = dbChunk ? [dbChunk] : [];
    }

    // Tính tổng chars
    const articleChars = allChunks.reduce((s, c) => s + c.content.length, 0);
    // Top ALWAYS_INCLUDE_TOP_N articles luôn được include kể cả vượt nhẹ MAX_TOTAL_CHARS.
    // Sau đó mới check budget cho article thứ 4+.
    if (
      result.length >= ALWAYS_INCLUDE_TOP_N &&
      totalChars + articleChars > MAX_TOTAL_CHARS
    ) {
      break;
    }
    totalChars += articleChars;

    result.push({
      documentId: b.documentId,
      documentTitle: b.documentTitle,
      documentNumber: b.documentNumber,
      documentType: b.documentType,
      article: b.article && !b.article.startsWith("__no_article__") ? b.article : null,
      chunks: allChunks,
      matchedCount: b.matchedCount,
      aggregateScore: b.aggregateScore,
      maxChunkScore: b.maxChunkScore,
    });
  }

  return result;
}

/**
 * Build user message từ article groups - ghép Điều thành 1 block đầy đủ.
 */
export function buildArticleGroupedMessage(
  query: string,
  articles: ArticleGroup[]
): string {
  if (articles.length === 0) {
    return `Câu hỏi: ${query}

Hệ thống không tìm thấy văn bản pháp luật cụ thể nào liên quan đến câu hỏi này trong cơ sở dữ liệu của Phòng Kinh Tế. Hãy trả lời dựa trên kiến thức chung và khuyến nghị người dùng liên hệ Phòng Kinh Tế để được hướng dẫn chi tiết hoặc tham khảo văn bản chính thức từ cổng thông tin chinhphu.vn, hanoi.gov.vn.`;
  }

  const blocks = articles.map((a, i) => {
    const articleHeader = a.article ? a.article : "(Trích đoạn)";
    // Nối các chunks của 1 Điều thành 1 block, KHÔNG lặp tiêu đề
    const body = a.chunks
      .map((c) => c.content.trim())
      .join("\n")
      .trim();

    return `[Nguồn ${i + 1}] ${a.documentTitle} (${a.documentNumber}) - ${articleHeader}:
${body}`;
  });

  return `VĂN BẢN PHÁP LUẬT THAM KHẢO:
${blocks.join("\n\n---\n\n")}

CÂU HỎI: ${query}

Hãy trả lời đầy đủ, chi tiết câu hỏi dựa trên văn bản pháp luật ở trên. Khi trả lời:
- Liệt kê ĐẦY ĐỦ các Khoản, điểm có trong Điều liên quan (KHÔNG bỏ sót, KHÔNG dừng giữa chừng)
- Trích dẫn NGẮN GỌN: dùng dạng "[Số văn bản, Điều X, Khoản Y]" - ví dụ "[150/2025/NĐ-CP, Điều 4, Khoản 1]" thay vì lặp lại nguyên tiêu đề dài
- Có thể trích dẫn 1 lần ở cuối Khoản hoặc 1 lần ở cuối câu trả lời, không cần lặp ở mỗi gạch đầu dòng
- Nếu Điều có nhiều Khoản, hãy nêu hết tất cả các Khoản đó
- KHÔNG nói "không có thông tin chi tiết" nếu nội dung Điều đã có sẵn ở trên - phải đọc kỹ và liệt kê hết`;
}

/**
 * Convert ArticleGroup[] → flat sources cho UI hiển thị.
 */
export function articleGroupsToSources(articles: ArticleGroup[]): Array<{
  documentId: string;
  documentTitle: string;
  article: string | null;
  section: string | null;
}> {
  return articles.map((a) => ({
    documentId: a.documentId,
    documentTitle: `${a.documentTitle} (${a.documentNumber})`,
    article: a.article,
    section: null, // Đã ghép cả Điều, không cần Khoản riêng
  }));
}
