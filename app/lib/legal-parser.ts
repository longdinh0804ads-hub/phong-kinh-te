// Parser cho văn bản pháp luật tiếng Việt theo cấu trúc Điều/Khoản/Điểm

export interface ParsedChunk {
  chunkIndex: number;
  article: string | null;  // "Điều 5"
  section: string | null;  // "Khoản 2"
  point: string | null;    // "Điểm a"
  content: string;
}

const ARTICLE_RE = /^\s*(Điều\s+\d+[\.\:]?)\s*/im;
const SECTION_RE = /^\s*(\d+[\.\)])\s+/m;
const POINT_RE = /^\s*([a-zđ][\.\)])\s+/m;

/**
 * Chunk văn bản pháp luật VN theo Điều/Khoản.
 * Mỗi Điều = 1 chunk lớn. Nếu Điều quá dài (>1500 chars) thì split theo Khoản.
 */
export function chunkLegalText(text: string): ParsedChunk[] {
  // Normalize: collapse multiple newlines
  const normalized = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  // Split by Điều
  const articleSplits = normalized.split(/(?=^\s*Điều\s+\d+)/m).filter((s) => s.trim().length > 30);

  if (articleSplits.length === 0) {
    // Fallback: chunk by 1000 chars
    return chunkByLength(normalized, 1000, 200).map((content, i) => ({
      chunkIndex: i,
      article: null,
      section: null,
      point: null,
      content,
    }));
  }

  const chunks: ParsedChunk[] = [];
  let chunkIdx = 0;

  for (const articleText of articleSplits) {
    const articleMatch = articleText.match(/Điều\s+(\d+)/);
    const articleLabel = articleMatch ? `Điều ${articleMatch[1]}` : null;

    if (articleText.length <= 1500) {
      // Short enough, single chunk
      chunks.push({
        chunkIndex: chunkIdx++,
        article: articleLabel,
        section: null,
        point: null,
        content: articleText.trim(),
      });
    } else {
      // Split by Khoản (section)
      const sections = articleText.split(/(?=^\s*\d+[\.\)])/m).filter((s) => s.trim().length > 20);

      if (sections.length <= 1) {
        // Can't split, force chunk by length
        for (const part of chunkByLength(articleText, 1500, 300)) {
          chunks.push({
            chunkIndex: chunkIdx++,
            article: articleLabel,
            section: null,
            point: null,
            content: part,
          });
        }
      } else {
        // First chunk is article header
        if (sections[0].trim().length > 0) {
          chunks.push({
            chunkIndex: chunkIdx++,
            article: articleLabel,
            section: null,
            point: null,
            content: sections[0].trim(),
          });
        }

        for (const section of sections.slice(1)) {
          const sectionMatch = section.match(/^\s*(\d+)[\.\)]/);
          const sectionLabel = sectionMatch ? `Khoản ${sectionMatch[1]}` : null;
          chunks.push({
            chunkIndex: chunkIdx++,
            article: articleLabel,
            section: sectionLabel,
            point: null,
            content: section.trim(),
          });
        }
      }
    }
  }

  return chunks.filter((c) => c.content.length >= 30);
}

function chunkByLength(text: string, maxLen: number, overlap: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + maxLen, text.length);
    let chunkEnd = end;
    if (end < text.length) {
      // Try to break at sentence boundary
      const lastPeriod = text.lastIndexOf(".", end);
      const lastNewline = text.lastIndexOf("\n", end);
      const boundary = Math.max(lastPeriod, lastNewline);
      if (boundary > start + maxLen * 0.5) chunkEnd = boundary + 1;
    }
    chunks.push(text.slice(start, chunkEnd).trim());
    start = chunkEnd - overlap;
    if (start < 0) start = 0;
  }
  return chunks;
}

/**
 * Tokenize tiếng Việt cho keyword search (basic).
 * Loại bỏ dấu, lowercase, split theo space.
 */
export function tokenize(text: string): string[] {
  const stripped = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^\p{L}\p{N}\s]/gu, " ");
  return stripped.split(/\s+/).filter((t) => t.length >= 2);
}

const STOPWORDS = new Set([
  "la", "cua", "va", "co", "cho", "trong", "voi", "tu", "den", "tai", "nay", "do",
  "duoc", "se", "nhu", "ve", "khi", "neu", "thi", "ma", "hay", "hoac", "cac", "mot",
  "nhung", "boi", "vi", "nen", "phai", "khong", "co", "the", "lam", "nao", "ai",
]);

export function tokenizeKeywords(text: string): string[] {
  return tokenize(text).filter((t) => !STOPWORDS.has(t));
}
