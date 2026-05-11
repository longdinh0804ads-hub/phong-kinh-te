// Hybrid retrieval: BM25 + cosine similarity (vector embedding).
// Kết hợp 2 score qua weighted sum, tận dụng cả keyword exact match lẫn semantic.
//
// Workflow:
//   1. Embed query → vector
//   2. Vector search (top 30) qua pgvector cosine
//   3. BM25 score CÙNG TẬP CHUNKS đó (tận dụng keyword match)
//   4. Combine score: 0.6 * cosine + 0.4 * bm25_norm
//   5. Re-sort, trả top-K

import { db } from "./db";
import { embedText, vectorToSql, isEmbeddingAvailable, EMBEDDING_DIM } from "./embeddings";
import { bm25Score, normalizeBm25, type ScoringInput } from "./rag-scoring";
import type { RetrievedChunk } from "./rag";

const CANDIDATE_POOL_SIZE = 30; // Số chunk lấy từ vector search rồi re-rank
const COSINE_WEIGHT = 0.6;
const BM25_WEIGHT = 0.4;

interface VectorRow {
  id: string;
  documentId: string;
  document_title: string;
  document_type: string;
  document_number: string;
  article: string | null;
  section: string | null;
  content: string;
  cosine_distance: number; // pgvector trả distance, similarity = 1 - distance
}

/**
 * Hybrid retrieval. Fallback về BM25-only nếu embedding không khả dụng.
 */
export async function retrieveHybrid(
  query: string,
  topK = 8
): Promise<RetrievedChunk[]> {
  if (!query || query.trim().length < 2) return [];

  // Bước 1: Embed query
  const hasEmbedding = isEmbeddingAvailable();
  let queryVec: number[] | null = null;
  if (hasEmbedding) {
    queryVec = await embedText(query, "RETRIEVAL_QUERY");
  }

  // Nếu không embed được → fallback BM25-only trên toàn bộ corpus
  if (!queryVec) {
    return fallbackBm25Only(query, topK);
  }

  // Bước 2: Vector search top CANDIDATE_POOL_SIZE qua pgvector
  const literal = vectorToSql(queryVec);
  const candidates: VectorRow[] = await db.$queryRawUnsafe(
    `SELECT
       c.id, c."documentId", c.article, c.section, c.content,
       d.title as document_title,
       d."docType" as document_type,
       d."docNumber" as document_number,
       (c.embedding <=> $1::vector) as cosine_distance
     FROM legal_chunks c
     JOIN legal_documents d ON d.id = c."documentId"
     WHERE d.status = 'active' AND c.embedding IS NOT NULL
     ORDER BY c.embedding <=> $1::vector
     LIMIT ${CANDIDATE_POOL_SIZE}`,
    literal
  );

  if (candidates.length === 0) {
    return fallbackBm25Only(query, topK);
  }

  // Bước 3: BM25 score TRÊN TẬP CANDIDATES (re-rank chứ không phải full corpus search)
  const bm25Inputs: ScoringInput[] = candidates.map((c) => ({
    id: c.id,
    documentId: c.documentId,
    documentTitle: c.document_title,
    documentNumber: c.document_number,
    documentType: c.document_type,
    article: c.article,
    section: c.section,
    content: c.content,
  }));
  const bm25 = normalizeBm25(bm25Score(query, bm25Inputs));
  const bm25Map = new Map(bm25.map((s) => [s.id, s]));

  // Bước 4: Combine scores
  const combined = candidates.map((c) => {
    const cosineSim = 1 - c.cosine_distance; // distance ∈ [0, 2], sim ∈ [-1, 1]
    const cosineNorm = Math.max(0, Math.min(1, (cosineSim + 1) / 2)); // → [0, 1]
    const bm = bm25Map.get(c.id);
    const bm25Norm = bm?.bm25Score ?? 0; // đã normalize [0, 1]

    const finalScore = COSINE_WEIGHT * cosineNorm + BM25_WEIGHT * bm25Norm;

    return {
      id: c.id,
      documentId: c.documentId,
      documentTitle: c.document_title,
      documentType: c.document_type,
      documentNumber: c.document_number,
      article: c.article,
      section: c.section,
      content: c.content,
      score: finalScore,
      _cosine: cosineNorm,
      _bm25: bm25Norm,
    };
  });

  combined.sort((a, b) => b.score - a.score);
  return combined.slice(0, topK).map(({ _cosine, _bm25, ...rest }) => rest);
}

/**
 * Fallback: BM25-only trên toàn bộ corpus (khi không có embedding).
 */
async function fallbackBm25Only(
  query: string,
  topK: number
): Promise<RetrievedChunk[]> {
  // M-7 fix: cap 1000 chunks để không tràn RAM khi corpus lớn
  const chunks = await db.legalChunk.findMany({
    where: { document: { status: "active" } },
    include: {
      document: {
        select: { id: true, title: true, docType: true, docNumber: true },
      },
    },
    take: 1000,
  });

  const inputs: ScoringInput[] = chunks.map((c) => ({
    id: c.id,
    documentId: c.documentId,
    documentTitle: c.document.title,
    documentNumber: c.document.docNumber,
    documentType: c.document.docType,
    article: c.article,
    section: c.section,
    content: c.content,
  }));

  const scored = bm25Score(query, inputs);
  return scored
    .filter((s) => s.bm25Score > 0)
    .slice(0, topK)
    .map((s) => ({
      id: s.id,
      documentId: s.documentId,
      documentTitle: s.documentTitle,
      documentType: s.documentType,
      documentNumber: s.documentNumber,
      article: s.article,
      section: s.section,
      content: s.content,
      score: s.bm25Score,
    }));
}
