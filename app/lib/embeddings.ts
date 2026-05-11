// Embedding via Gemini gemini-embedding-001 (Matryoshka, truncate xuống 768 dim).
// Dùng REST API trực tiếp để control outputDimensionality (SDK cũ chưa support).

import { getGeminiRotator } from "./api-key-rotator";

export const EMBEDDING_DIM = 768;
const EMBEDDING_MODEL = "gemini-embedding-001";
const API_VERSION = "v1beta";

interface EmbedResponse {
  embedding?: { values: number[] };
  error?: { code: number; message: string; status: string };
}

/**
 * Embed 1 text → vector 768 dim. Trả null nếu fail.
 * Dùng task type "RETRIEVAL_DOCUMENT" hoặc "RETRIEVAL_QUERY" để optimize cho RAG.
 */
export async function embedText(
  text: string,
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" = "RETRIEVAL_DOCUMENT"
): Promise<number[] | null> {
  const trimmed = text.slice(0, 8000); // ~ 2048 token limit
  if (trimmed.trim().length < 5) return null;

  const rotator = getGeminiRotator();
  if (!rotator.hasAvailableKey()) return null;

  try {
    return await rotator.runWithRotation(async (apiKey) => {
      const url =
        `https://generativelanguage.googleapis.com/${API_VERSION}/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`;
      const body = {
        content: { parts: [{ text: trimmed }] },
        taskType,
        outputDimensionality: EMBEDDING_DIM,
      };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as EmbedResponse;
      if (!res.ok || data.error) {
        const err: any = new Error(
          data.error?.message || `HTTP ${res.status}`
        );
        err.status = res.status;
        throw err;
      }
      const values = data.embedding?.values;
      if (!Array.isArray(values) || values.length !== EMBEDDING_DIM) {
        throw new Error(
          `Invalid embedding length: got ${values?.length}, expected ${EMBEDDING_DIM}`
        );
      }
      // Normalize to unit vector (Matryoshka cần re-normalize sau khi truncate)
      let norm = 0;
      for (const v of values) norm += v * v;
      norm = Math.sqrt(norm);
      if (norm === 0) return values;
      return values.map((v) => v / norm);
    });
  } catch (e: any) {
    console.error("[embed] Failed:", e?.message);
    return null;
  }
}

/**
 * Embed nhiều texts song song với concurrency limit.
 * Trả mảng cùng độ dài; phần tử null = fail.
 */
export async function embedBatch(
  texts: string[],
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" = "RETRIEVAL_DOCUMENT",
  concurrency = 4
): Promise<Array<number[] | null>> {
  const results: Array<number[] | null> = new Array(texts.length).fill(null);
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const idx = cursor++;
      if (idx >= texts.length) return;
      results[idx] = await embedText(texts[idx], taskType);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, texts.length) }, () => worker())
  );
  return results;
}

/**
 * Format vector array → pgvector literal "[0.1, 0.2, ...]"
 */
export function vectorToSql(vec: number[]): string {
  return "[" + vec.join(",") + "]";
}

export function isEmbeddingAvailable(): boolean {
  return getGeminiRotator().hasAvailableKey();
}

/**
 * Cosine similarity giữa 2 vector. Nếu cả 2 đã unit-normalized thì = dot product.
 */
export function cosineSim(a: number[], b: number[]): number {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
