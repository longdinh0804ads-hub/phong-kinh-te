/**
 * Extract text từ file upload (PDF, DOCX, TXT).
 *
 * Sử dụng:
 *   - pdf-parse cho PDF (đã cài sẵn)
 *   - mammoth-style DOCX parsing (tạm bỏ qua - chỉ PDF + TXT cho Phase 2)
 *   - UTF-8 decode cho TXT
 *
 * Server-only (dynamic import pdf-parse).
 */

export interface ExtractResult {
  text: string;
  pageCount: number;
  warnings: string[];
}

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export async function extractTextFromFile(file: File): Promise<ExtractResult> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File quá lớn (tối đa ${MAX_FILE_SIZE / 1024 / 1024}MB)`);
  }

  const warnings: string[] = [];
  const ext = file.name.toLowerCase().split(".").pop() || "";
  const mime = file.type || "";

  if (ext === "txt" || mime.startsWith("text/")) {
    const text = await file.text();
    return { text, pageCount: 1, warnings };
  }

  if (ext === "pdf" || mime.includes("pdf")) {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      const text = result.text || "";
      const pageCount = (result as any).pages?.length || text.split("\f").length || 1;
      if (text.trim().length < 200) {
        warnings.push(
          "Văn bản trích từ PDF rất ngắn (<200 ký tự). Có thể là PDF scan, cần OCR."
        );
      }
      return { text, pageCount, warnings };
    } catch (e: any) {
      throw new Error(`Không đọc được PDF: ${e?.message || "unknown"}`);
    }
  }

  throw new Error(
    `Định dạng file không hỗ trợ: ${ext || mime}. Hỗ trợ: PDF, TXT.`
  );
}
