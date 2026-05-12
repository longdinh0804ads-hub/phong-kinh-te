/**
 * Extract text từ file upload (PDF, TXT) với OCR fallback.
 *
 * Pipeline cho PDF:
 *   1. pdf-parse (text-extractable PDF) → fast, free
 *   2. Nếu text quá ngắn (<200 chars hoặc <200/page) → OCR Gemini Vision
 *   3. Nếu OCR cũng fail → throw error
 *
 * Server-only (dynamic import pdf-parse + pdf-ocr).
 */
import { ocrPDFDetailed, isOCRAvailable } from "./pdf-ocr";

export interface ExtractResult {
  text: string;
  pageCount: number;
  warnings: string[];
  /** Có dùng OCR không (báo cho user biết để debug) */
  usedOCR: boolean;
  /** Chi tiết OCR nếu có */
  ocrInfo?: {
    batchCount: number;
    failedBatches: number[];
    durationMs: number;
  };
}

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const MIN_TEXT_CHARS = 200; // dưới ngưỡng → coi như PDF scan
const MIN_CHARS_PER_PAGE = 200; // text dày bình thường ≥1500/page

export async function extractTextFromFile(file: File): Promise<ExtractResult> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File quá lớn (tối đa ${MAX_FILE_SIZE / 1024 / 1024}MB)`);
  }

  const warnings: string[] = [];
  const ext = file.name.toLowerCase().split(".").pop() || "";
  const mime = file.type || "";

  if (ext === "txt" || mime.startsWith("text/")) {
    const text = await file.text();
    return { text, pageCount: 1, warnings, usedOCR: false };
  }

  if (ext === "pdf" || mime.includes("pdf")) {
    return await extractPDF(file, warnings);
  }

  throw new Error(`Định dạng file không hỗ trợ: ${ext || mime}. Hỗ trợ: PDF, TXT.`);
}

async function extractPDF(file: File, warnings: string[]): Promise<ExtractResult> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // 1. Thử pdf-parse trước (fast path)
  let text = "";
  let pageCount = 1;
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    text = result.text || "";
    pageCount = (result as any).pages?.length || text.split("\f").length || 1;
  } catch (e: any) {
    warnings.push(`pdf-parse fail (${e?.message || "unknown"}), thử OCR fallback`);
  }

  const trimmedLength = text.trim().length;
  const charsPerPage = pageCount > 0 ? trimmedLength / pageCount : trimmedLength;
  const needsOCR = trimmedLength < MIN_TEXT_CHARS || charsPerPage < MIN_CHARS_PER_PAGE;

  // 2. Text đủ → return luôn
  if (!needsOCR) {
    return { text, pageCount, warnings, usedOCR: false };
  }

  // 3. Text yếu → OCR
  if (!isOCRAvailable()) {
    warnings.push(
      `Text yếu (${trimmedLength} chars / ${pageCount} pages) nhưng OCR không khả dụng (thiếu GEMINI_API_KEY)`
    );
    return { text, pageCount, warnings, usedOCR: false };
  }

  console.log(
    `[extractor] Text yếu (${trimmedLength} chars / ${pageCount} pages = ${charsPerPage.toFixed(0)} c/p) → OCR Gemini Vision`
  );

  try {
    const ocrResult = await ocrPDFDetailed(buffer);
    if (ocrResult && ocrResult.text.length >= MIN_TEXT_CHARS) {
      warnings.push(
        `Đã dùng OCR (${ocrResult.batchCount} batches, ${(ocrResult.durationMs / 1000).toFixed(1)}s)`
      );
      if (ocrResult.failedBatches.length > 0) {
        warnings.push(`OCR fail ${ocrResult.failedBatches.length} batch(es) - text có thể thiếu`);
      }
      return {
        text: ocrResult.text,
        pageCount,
        warnings,
        usedOCR: true,
        ocrInfo: {
          batchCount: ocrResult.batchCount,
          failedBatches: ocrResult.failedBatches,
          durationMs: ocrResult.durationMs,
        },
      };
    }
    warnings.push(
      `OCR cũng không trích được nội dung (${ocrResult?.text.length || 0} chars). PDF có thể bị mã hóa hoặc chất lượng quá thấp.`
    );
    return { text, pageCount, warnings, usedOCR: true };
  } catch (e: any) {
    warnings.push(`OCR fail: ${e?.message || "unknown"}`);
    return { text, pageCount, warnings, usedOCR: false };
  }
}
