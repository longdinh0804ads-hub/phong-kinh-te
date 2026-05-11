import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { extractLegalMetadataWithAI } from "@/lib/ai-legal-extract";
import { ocrPDFDetailed, isOCRAvailable } from "@/lib/pdf-ocr";

export const runtime = "nodejs";
// Max 5 phút cho OCR PDF lớn (200+ trang qua nhiều batch)
export const maxDuration = 300;

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB - đủ cho PDF 500+ trang

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user.role, "legal:upload")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Không có file được tải lên" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File quá lớn (tối đa ${MAX_FILE_SIZE / 1024 / 1024}MB)` },
      { status: 400 }
    );
  }

  if (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Chỉ chấp nhận file PDF" }, { status: 400 });
  }

  try {
    // Extract text từ PDF
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });

    let text = "";
    let pageCount = 0;
    try {
      const result = await parser.getText();
      text = result.text || "";
      pageCount = (result as any).pages?.length || text.split("\f").length || 1;
    } catch (extractErr: any) {
      return NextResponse.json(
        {
          error: `Không thể đọc file PDF: ${extractErr?.message || "lỗi không xác định"}. ` +
                 `File có thể bị mã hóa hoặc bảo vệ. Vui lòng nhập thủ công.`,
          textLength: 0,
        },
        { status: 422 }
      );
    }

    let trimmedLength = text.trim().length;
    let usedOCR = false;

    // Heuristic phát hiện PDF "yếu text":
    // - Total text < 200 chars → empty/scan
    // - Hoặc < 200 chars/page (text bị chặn bởi chữ ký số VGP/CA, scan ảnh, v.v.)
    // Văn bản pháp luật bình thường có 1500-3000 chars/page.
    const charsPerPage = pageCount > 0 ? trimmedLength / pageCount : trimmedLength;
    const looksLikeImageOrProtected = trimmedLength < 200 || charsPerPage < 200;

    let ocrBatchInfo: {
      batchCount: number;
      failedBatches: number[];
      durationMs?: number;
      concurrency?: number;
    } | null = null;

    if (looksLikeImageOrProtected) {
      console.log(
        `[parse-pdf] Text yếu (${trimmedLength} chars / ${pageCount} pages = ${charsPerPage.toFixed(0)} chars/page) → thử Batch OCR`
      );

      if (isOCRAvailable()) {
        const ocrResult = await ocrPDFDetailed(buffer);
        if (ocrResult && ocrResult.text.length >= 200) {
          text = ocrResult.text;
          trimmedLength = text.trim().length;
          usedOCR = true;
          ocrBatchInfo = {
            batchCount: ocrResult.batchCount,
            failedBatches: ocrResult.failedBatches,
            durationMs: ocrResult.durationMs,
            concurrency: ocrResult.concurrency,
          };
          console.log(
            `[parse-pdf] OCR thành công: ${trimmedLength} ký tự, ${ocrResult.batchCount} batch(es), ` +
              `${ocrResult.failedBatches.length} batch fail, ` +
              `${(ocrResult.durationMs / 1000).toFixed(1)}s, concurrency=${ocrResult.concurrency}`
          );
        }
      }

      // OCR cũng thất bại hoặc không khả dụng
      if (!usedOCR) {
        const ocrHint = isOCRAvailable()
          ? "OCR cũng không trích được nội dung. Thử lại sau ít phút (có thể bị rate limit Gemini)."
          : "OCR chưa được cấu hình (cần GEMINI_API_KEY hoặc GEMINI_API_KEYS).";

        return NextResponse.json(
          {
            error:
              `PDF không trích xuất được text (chỉ ${trimmedLength} ký tự cho ${pageCount} trang). ${ocrHint}\n\n` +
              `Nguyên nhân thường gặp:\n` +
              `• File chữ ký số (VGP/CA) chặn text extraction\n` +
              `• File scan ảnh chất lượng thấp\n` +
              `• File PDF được mã hóa\n` +
              `• File quá lớn vượt giới hạn AI xử lý\n\n` +
              `Giải pháp: Mở file PDF trong trình đọc, copy toàn bộ nội dung và dán vào ô "Toàn văn nội dung" bên dưới.`,
            textLength: trimmedLength,
            extractedPreview: text.slice(0, 500),
            pageCount,
          },
          { status: 422 }
        );
      }
    }

    // Parse metadata bằng AI (fallback regex nếu AI không khả dụng)
    const metadata = await extractLegalMetadataWithAI(text);

    return NextResponse.json({
      success: true,
      metadata,
      fileName: file.name,
      fileSize: file.size,
      pageCount,
      textLength: trimmedLength,
      usedOCR,
      ocrBatches: ocrBatchInfo,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Không xử lý được file PDF: " + (e?.message || "lỗi không xác định") },
      { status: 500 }
    );
  }
}
