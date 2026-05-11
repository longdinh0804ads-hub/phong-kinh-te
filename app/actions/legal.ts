"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth, requirePermission } from "@/lib/session";
import { chunkLegalText } from "@/lib/legal-parser";
import { embedBatch, vectorToSql, isEmbeddingAvailable, EMBEDDING_DIM } from "@/lib/embeddings";

const uploadSchema = z.object({
  title: z.string().min(5).max(500),
  docType: z.enum(["NGHI_DINH", "THONG_TU", "QUYET_DINH", "LUAT", "NGHI_QUYET", "CONG_VAN"]),
  docNumber: z.string().min(2).max(100),
  issuedDate: z.coerce.date(),
  effectiveDate: z.coerce.date(),
  fullText: z.string().min(100).max(2_000_000), // 2M chars ~ đủ cho mọi văn bản pháp luật
  summary: z.string().max(5000).optional().nullable(),
});

export async function uploadLegalDocument(
  input: z.infer<typeof uploadSchema>
): Promise<{ success: true; id: string; chunkCount: number } | { error: string }> {
  const user = await requirePermission("legal:upload");
  const data = uploadSchema.parse(input);

  // Check trùng
  const exists = await db.legalDocument.findUnique({
    where: { docType_docNumber: { docType: data.docType, docNumber: data.docNumber } },
  });
  if (exists) return { error: "Văn bản đã tồn tại trong hệ thống" };

  // Chunk văn bản
  const chunks = chunkLegalText(data.fullText);
  if (chunks.length === 0) {
    return { error: "Không thể chia chunk văn bản, vui lòng kiểm tra nội dung" };
  }

  const doc = await db.legalDocument.create({
    data: {
      title: data.title,
      docType: data.docType,
      docNumber: data.docNumber,
      issuedDate: data.issuedDate,
      effectiveDate: data.effectiveDate,
      summary: data.summary || null,
      status: "active",
      uploadedById: user.id,
      chunks: {
        create: chunks.map((c) => ({
          chunkIndex: c.chunkIndex,
          article: c.article,
          section: c.section,
          point: c.point,
          content: c.content,
        })),
      },
    },
    include: { chunks: { select: { id: true, content: true, chunkIndex: true } } },
  });

  // Sinh embedding song song cho từng chunk (best-effort - không fail upload nếu embed fail)
  if (isEmbeddingAvailable()) {
    try {
      const sortedChunks = [...doc.chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
      const texts = sortedChunks.map((c) => c.content);
      const vecs = await embedBatch(texts, "RETRIEVAL_DOCUMENT", 4);
      let embedded = 0;
      for (let i = 0; i < sortedChunks.length; i++) {
        const v = vecs[i];
        if (!v || v.length !== EMBEDDING_DIM) continue;
        await db.$executeRawUnsafe(
          `UPDATE legal_chunks SET embedding = $1::vector WHERE id = $2`,
          vectorToSql(v),
          sortedChunks[i].id
        );
        embedded++;
      }
      console.log(`[legal-upload] Embedded ${embedded}/${sortedChunks.length} chunks for doc ${doc.id}`);
    } catch (e: any) {
      console.error("[legal-upload] Embedding failed (non-fatal):", e?.message);
    }
  }

  revalidatePath("/legal");
  return { success: true, id: doc.id, chunkCount: chunks.length };
}

export async function deleteLegalDocument(id: string): Promise<{ success: true } | { error: string }> {
  await requirePermission("legal:manage");
  try {
    await db.legalDocument.delete({ where: { id } });
    revalidatePath("/legal");
    return { success: true };
  } catch (e: any) {
    return { error: "Không thể xóa văn bản: " + (e?.message || "lỗi không xác định") };
  }
}

export async function setLegalStatus(
  id: string,
  status: "active" | "superseded" | "expired"
): Promise<{ success: true } | { error: string }> {
  await requirePermission("legal:manage");
  try {
    await db.legalDocument.update({ where: { id }, data: { status } });
    revalidatePath("/legal");
    return { success: true };
  } catch (e: any) {
    return { error: "Không thể cập nhật: " + (e?.message || "lỗi không xác định") };
  }
}
