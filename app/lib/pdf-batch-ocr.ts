// Batch OCR cho PDF lớn: split thành các batch nhỏ → OCR song song qua Gemini → ghép.
// Tận dụng multi-API-key để chạy nhiều batch cùng lúc (concurrency = số key).
// Với 2 key Gemini + 15 trang/batch: PDF 200 trang xử lý trong ~1-1.5 phút thay vì 5 phút.

import { PDFDocument } from "pdf-lib";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getGeminiRotator } from "./api-key-rotator";

const BATCH_SIZE = 15; // Số trang/batch (nhỏ hơn = single OCR nhanh hơn, nhiều batch hơn = parallel hiệu quả hơn)
const MAX_INLINE_BYTES = 18 * 1024 * 1024; // 18MB - dưới giới hạn 20MB Gemini
const MAX_CONCURRENCY = 4; // Trần concurrency dù có nhiều key (tránh quota burst)
const MIN_CONCURRENCY = 2; // Sàn concurrency: dù chỉ 1 key vẫn chạy 2 song song (Gemini per-key cho phép)

const OCR_PROMPT =
  `Hãy trích xuất TOÀN BỘ nội dung text từ file PDF này, bao gồm cả văn bản trong ảnh nếu có. ` +
  `Giữ nguyên cấu trúc và thứ tự đọc tự nhiên (header, tiêu đề, các điều, khoản). ` +
  `KHÔNG thêm bình luận, KHÔNG markdown - chỉ trả về plain text thô.`;

export interface BatchOCRProgress {
  totalBatches: number;
  currentBatch: number;
  pagesProcessed: number;
  totalPages: number;
}

export interface BatchOCRResult {
  text: string;
  totalPages: number;
  batchCount: number;
  textLength: number;
  failedBatches: number[];
  durationMs: number;
  concurrency: number;
}

interface BatchJob {
  index: number; // thứ tự batch (0-based) để giữ đúng order khi ghép
  startPage: number; // 0-based
  endPage: number; // exclusive
  buffer: Buffer;
}

interface BatchOutcome {
  index: number;
  startPage: number;
  endPage: number;
  text: string | null;
  error?: string;
}

/**
 * OCR PDF lớn bằng cách split thành batches và chạy song song qua nhiều API key.
 * Concurrency tự động = min(số key Gemini × 2, MAX_CONCURRENCY).
 */
export async function batchOCRPDF(
  pdfBuffer: Buffer,
  onProgress?: (p: BatchOCRProgress) => void
): Promise<BatchOCRResult | null> {
  const startTime = Date.now();
  const rotator = getGeminiRotator();
  if (!rotator.hasAvailableKey()) {
    console.log("[batch-ocr] Không có Gemini key khả dụng");
    return null;
  }

  // Load PDF
  let pdfDoc: PDFDocument;
  try {
    pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  } catch (e: any) {
    console.error("[batch-ocr] Không load được PDF:", e?.message);
    return null;
  }

  const totalPages = pdfDoc.getPageCount();
  // Concurrency: mỗi key có thể chạy 2 request song song (Gemini cho phép),
  // nhưng cap ở MAX_CONCURRENCY để tránh burst.
  const keyCount = Math.max(1, rotator.getKeyCount());
  const concurrency = Math.max(
    MIN_CONCURRENCY,
    Math.min(MAX_CONCURRENCY, keyCount * 2)
  );

  console.log(
    `[batch-ocr] Bắt đầu OCR ${totalPages} trang | ` +
      `${keyCount} key × concurrency ${concurrency}`
  );

  // Fast path: file đủ nhỏ → OCR 1 lần
  if (pdfBuffer.length < MAX_INLINE_BYTES && totalPages <= BATCH_SIZE) {
    onProgress?.({ totalBatches: 1, currentBatch: 1, pagesProcessed: 0, totalPages });
    const text = await ocrSingleBuffer(pdfBuffer);
    if (text) {
      return {
        text,
        totalPages,
        batchCount: 1,
        textLength: text.length,
        failedBatches: [],
        durationMs: Date.now() - startTime,
        concurrency: 1,
      };
    }
    return null;
  }

  // Bước 1: Tạo tất cả sub-PDF (split nhanh, không gọi network)
  const jobs: BatchJob[] = [];
  const batchCount = Math.ceil(totalPages / BATCH_SIZE);

  for (let b = 0; b < batchCount; b++) {
    const startPage = b * BATCH_SIZE;
    const endPage = Math.min(startPage + BATCH_SIZE, totalPages);
    const pageIndices = Array.from(
      { length: endPage - startPage },
      (_, i) => startPage + i
    );

    try {
      const subDoc = await PDFDocument.create();
      const copiedPages = await subDoc.copyPages(pdfDoc, pageIndices);
      copiedPages.forEach((p) => subDoc.addPage(p));
      const buffer = Buffer.from(await subDoc.save());
      jobs.push({ index: b, startPage, endPage, buffer });
    } catch (e: any) {
      console.error(`[batch-ocr] Split batch ${b + 1} lỗi:`, e?.message);
      // Tạo job rỗng để vẫn track failed batch
      jobs.push({ index: b, startPage, endPage, buffer: Buffer.alloc(0) });
    }
  }

  // Bước 2: Chạy OCR song song với concurrency limiter
  const outcomes: BatchOutcome[] = new Array(batchCount);
  let completed = 0;

  // Worker pool pattern: dùng cursor + Promise.all để chạy song song có giới hạn
  let cursor = 0;
  const runWorker = async (workerId: number): Promise<void> => {
    while (true) {
      const myIndex = cursor++;
      if (myIndex >= jobs.length) return;
      const job = jobs[myIndex];

      const sizeKB = (job.buffer.length / 1024).toFixed(0);
      console.log(
        `[batch-ocr] [W${workerId}] Batch ${job.index + 1}/${batchCount}: ` +
          `pages ${job.startPage + 1}-${job.endPage} (${sizeKB} KB)`
      );

      let outcome: BatchOutcome;
      if (job.buffer.length === 0) {
        outcome = {
          index: job.index,
          startPage: job.startPage,
          endPage: job.endPage,
          text: null,
          error: "Split failed",
        };
      } else {
        try {
          const text = await ocrSingleBuffer(job.buffer);
          outcome = {
            index: job.index,
            startPage: job.startPage,
            endPage: job.endPage,
            text: text && text.length > 50 ? text : null,
            error: !text || text.length <= 50 ? "OCR empty/short" : undefined,
          };
        } catch (e: any) {
          outcome = {
            index: job.index,
            startPage: job.startPage,
            endPage: job.endPage,
            text: null,
            error: e?.message || "OCR failed",
          };
        }
      }

      outcomes[job.index] = outcome;
      completed++;
      onProgress?.({
        totalBatches: batchCount,
        currentBatch: completed,
        pagesProcessed: outcomes
          .filter((o) => o && o.text)
          .reduce((sum, o) => sum + (o.endPage - o.startPage), 0),
        totalPages,
      });
    }
  };

  // Khởi động `concurrency` worker chạy song song
  const workerCount = Math.min(concurrency, jobs.length);
  await Promise.all(
    Array.from({ length: workerCount }, (_, i) => runWorker(i + 1))
  );

  // Bước 3: Ghép kết quả theo đúng order
  const allTexts: string[] = [];
  const failedBatches: number[] = [];

  for (const outcome of outcomes) {
    if (outcome.text) {
      allTexts.push(
        `\n\n=== Trang ${outcome.startPage + 1}-${outcome.endPage} ===\n\n${outcome.text}`
      );
    } else {
      failedBatches.push(outcome.index + 1);
      // M-3 fix: thêm placeholder rõ ràng để text ghép giữ được order và không
      // mất nguyên một đoạn trang silently. Cán bộ duyệt sẽ thấy ngay đoạn nào thiếu.
      allTexts.push(
        `\n\n=== ⚠ Trang ${outcome.startPage + 1}-${outcome.endPage}: ` +
          `KHÔNG OCR ĐƯỢC (${outcome.error || "unknown"}) — vui lòng kiểm tra thủ công ===\n\n`
      );
      console.warn(
        `[batch-ocr] Batch ${outcome.index + 1} fail: ${outcome.error || "unknown"}`
      );
    }
  }

  const combinedText = allTexts.join("");
  const durationMs = Date.now() - startTime;

  if (combinedText.length < 200) {
    console.error(
      `[batch-ocr] Tất cả batch đều thất bại (${failedBatches.length}/${batchCount})`
    );
    return null;
  }

  console.log(
    `[batch-ocr] Hoàn thành: ${combinedText.length} ký tự | ` +
      `${batchCount - failedBatches.length}/${batchCount} batch OK | ` +
      `${(durationMs / 1000).toFixed(1)}s`
  );

  return {
    text: combinedText,
    totalPages,
    batchCount,
    textLength: combinedText.length,
    failedBatches,
    durationMs,
    concurrency,
  };
}

/**
 * OCR 1 buffer PDF (single batch). Auto-rotate key nếu fail.
 */
async function ocrSingleBuffer(pdfBuffer: Buffer): Promise<string | null> {
  const rotator = getGeminiRotator();

  try {
    return await rotator.runWithRotation(async (apiKey) => {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
          maxOutputTokens: 65000, // Cho phép output dài cho legal docs
        },
      });

      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: "application/pdf",
            data: pdfBuffer.toString("base64"),
          },
        },
        OCR_PROMPT,
      ]);

      const text = result.response.text();
      if (!text || text.trim().length < 50) {
        throw new Error("OCR result empty");
      }
      return text.trim();
    });
  } catch (e: any) {
    console.error("[ocr-single] Failed:", e?.message);
    return null;
  }
}
