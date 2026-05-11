// OCR fallback cho PDF scan/signed - dùng Gemini Vision API.
// Tự động chọn:
// - Single OCR cho file < 18MB & < 25 trang
// - Batch OCR cho file lớn (split thành batches để vượt giới hạn 20MB inline)

import { getGeminiRotator } from "./api-key-rotator";
import { batchOCRPDF, type BatchOCRResult } from "./pdf-batch-ocr";

/**
 * OCR PDF bằng Gemini Vision với auto-batch cho file lớn.
 * Tự rotate API key. Trả null nếu thất bại hoàn toàn.
 */
export async function ocrPDFWithGemini(pdfBuffer: Buffer): Promise<string | null> {
  const result = await batchOCRPDF(pdfBuffer);
  return result?.text ?? null;
}

/**
 * OCR + return chi tiết (cho UI hiển thị progress, batch count, failed batches).
 */
export async function ocrPDFDetailed(
  pdfBuffer: Buffer
): Promise<BatchOCRResult | null> {
  return batchOCRPDF(pdfBuffer);
}

export function isOCRAvailable(): boolean {
  return getGeminiRotator().hasAnyKey();
}
