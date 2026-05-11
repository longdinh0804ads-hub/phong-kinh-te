// BM25-style scoring với IDF, length normalization, article header boost.
// File này ADDITIVE - không sửa lib/rag.ts cũ.

import { tokenizeKeywords } from "./legal-parser";

export interface ScoringInput {
  id: string;
  documentId: string;
  documentTitle: string;
  documentNumber: string;
  documentType: string;
  article: string | null;
  section: string | null;
  content: string;
}

export interface ScoredChunk extends ScoringInput {
  bm25Score: number;
  matchedKeywords: string[];
  // Để debug
  _tf?: Record<string, number>;
  _headerBoost?: number;
}

// BM25 hyperparams (tuned cho văn bản pháp luật VN ~700-1500 chars/chunk)
const BM25_K1 = 1.5;
const BM25_B = 0.75;
const HEADER_BOOST_FACTOR = 3.0; // Match keyword trong dòng đầu được nhân 3
const ARTICLE_TITLE_LINE_LENGTH = 200; // 200 ký tự đầu được coi là "header"

/**
 * BM25 scoring với IDF + length normalization + article header boost.
 * Trả về danh sách chunks đã sort giảm dần theo score.
 */
export function bm25Score(
  query: string,
  inputs: ScoringInput[]
): ScoredChunk[] {
  const keywords = tokenizeKeywords(query);
  if (keywords.length === 0 || inputs.length === 0) {
    return inputs.map((c) => ({
      ...c,
      bm25Score: 0,
      matchedKeywords: [],
    }));
  }

  // Pre-tokenize tất cả chunks
  const allTokens = inputs.map((c) => tokenizeKeywords(c.content));
  const docLengths = allTokens.map((t) => t.length);
  const avgDocLen =
    docLengths.reduce((s, l) => s + l, 0) / Math.max(1, docLengths.length);

  // Compute document frequency (DF) cho từng keyword
  const N = inputs.length;
  const df = new Map<string, number>();
  for (const kw of keywords) {
    let count = 0;
    for (const tokens of allTokens) {
      if (tokens.includes(kw)) count++;
    }
    df.set(kw, count);
  }

  // IDF: log((N - df + 0.5) / (df + 0.5) + 1) - BM25 standard
  const idf = new Map<string, number>();
  for (const kw of keywords) {
    const dfCount = df.get(kw) || 0;
    idf.set(kw, Math.log((N - dfCount + 0.5) / (dfCount + 0.5) + 1));
  }

  // Score each chunk
  const scored: ScoredChunk[] = inputs.map((c, idx) => {
    const tokens = allTokens[idx];
    const docLen = docLengths[idx];
    const tf: Record<string, number> = {};
    for (const t of tokens) tf[t] = (tf[t] || 0) + 1;

    // Tokens trong "header" (200 ký tự đầu - thường chứa "Điều X. Tên điều")
    const headerText = c.content.slice(0, ARTICLE_TITLE_LINE_LENGTH);
    const headerTokens = new Set(tokenizeKeywords(headerText));

    let score = 0;
    const matched: string[] = [];
    let headerBoost = 0;

    for (const kw of keywords) {
      const f = tf[kw] || 0;
      if (f === 0) continue;
      matched.push(kw);

      const idfVal = idf.get(kw) || 0;
      // BM25 core formula
      const denom = f + BM25_K1 * (1 - BM25_B + (BM25_B * docLen) / avgDocLen);
      const tfNorm = (f * (BM25_K1 + 1)) / denom;
      let kwScore = idfVal * tfNorm;

      // Boost mạnh nếu keyword xuất hiện trong header (tên Điều)
      if (headerTokens.has(kw)) {
        kwScore *= HEADER_BOOST_FACTOR;
        headerBoost += kwScore - kwScore / HEADER_BOOST_FACTOR;
      }

      score += kwScore;
    }

    // Bonus thêm theo coverage (% keyword match được)
    const coverage = matched.length / keywords.length;
    score *= 0.5 + coverage * 0.5;

    return {
      ...c,
      bm25Score: score,
      matchedKeywords: matched,
      _tf: tf,
      _headerBoost: headerBoost,
    };
  });

  scored.sort((a, b) => b.bm25Score - a.bm25Score);
  return scored;
}

/**
 * Normalize BM25 scores về [0, 1] dựa trên max score.
 * Useful khi cần combine với cosine similarity (cũng [0,1]).
 */
export function normalizeBm25(scored: ScoredChunk[]): ScoredChunk[] {
  if (scored.length === 0) return scored;
  const maxScore = Math.max(...scored.map((s) => s.bm25Score));
  if (maxScore <= 0) return scored;
  return scored.map((s) => ({ ...s, bm25Score: s.bm25Score / maxScore }));
}
