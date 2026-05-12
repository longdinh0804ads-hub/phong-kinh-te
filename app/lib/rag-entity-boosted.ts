/**
 * Entity-boosted hybrid retrieval (Phase 1 của AI Agent).
 *
 * Cải tiến từ retrieveHybrid (vector + BM25) với:
 *   - Entity overlap score giữa query và chunks
 *   - Doc number exact match (boost mạnh khi query nhắc số văn bản)
 *   - Field/lĩnh vực match (boost vừa)
 *
 * Theo benchmark (15 queries × 8 văn bản):
 *   - Recall@5 overall: 75% → 80% (+5%)
 *   - Recall@5 multi-hop: 53% → 63% (+10%)
 *   - Latency tương đương (~380ms)
 *   - Không regression query đơn giản (100% single-hop cả 2)
 *
 * API tương thích với retrieveHybrid → drop-in replacement.
 */

import { retrieveHybrid } from "./rag-hybrid";
import type { RetrievedChunk } from "./rag";
import { extractEntities, entityBoostScore } from "./legal-entities";

const CANDIDATE_MULTIPLIER = 3; // Lấy 3x topK rồi re-rank với entity boost

/**
 * Hybrid retrieval + entity boost re-ranking.
 *
 * @param query Query string (tiếng Việt)
 * @param topK Số chunks trả về
 * @returns Top-K chunks sau khi re-rank theo entity overlap
 */
export async function retrieveEntityBoosted(
  query: string,
  topK = 8
): Promise<RetrievedChunk[]> {
  if (!query || query.trim().length < 2) return [];

  // 1. Lấy candidate pool lớn hơn để re-rank
  const candidates = await retrieveHybrid(query, topK * CANDIDATE_MULTIPLIER);
  if (candidates.length === 0) return [];

  // 2. Extract entities từ query (1 lần, reuse)
  const queryEntities = extractEntities(query);

  // 3. Re-rank: original score + entity boost
  const reranked = candidates.map((c) => {
    const boost = entityBoostScore(
      c.content,
      c.documentTitle,
      c.documentNumber,
      queryEntities
    );
    return {
      ...c,
      score: c.score + boost,
    };
  });

  reranked.sort((a, b) => b.score - a.score);
  return reranked.slice(0, topK);
}

/**
 * Trả về cả raw candidates + entity info (cho debug/analytics).
 */
export async function retrieveEntityBoostedDetailed(
  query: string,
  topK = 8
): Promise<{
  results: RetrievedChunk[];
  queryEntities: ReturnType<typeof extractEntities>;
  candidatePoolSize: number;
}> {
  const queryEntities = extractEntities(query);
  if (!query || query.trim().length < 2) {
    return { results: [], queryEntities, candidatePoolSize: 0 };
  }

  const candidates = await retrieveHybrid(query, topK * CANDIDATE_MULTIPLIER);
  if (candidates.length === 0) {
    return { results: [], queryEntities, candidatePoolSize: 0 };
  }

  const reranked = candidates
    .map((c) => ({
      ...c,
      score:
        c.score +
        entityBoostScore(c.content, c.documentTitle, c.documentNumber, queryEntities),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return {
    results: reranked,
    queryEntities,
    candidatePoolSize: candidates.length,
  };
}
