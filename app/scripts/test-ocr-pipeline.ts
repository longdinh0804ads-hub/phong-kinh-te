/**
 * Test pipeline extract + classify với PDF.
 * - Test 1: text PDF bình thường → pdf-parse, không OCR
 * - Test 2: text PDF text yếu (simulate bằng tạo Buffer rỗng) → OCR fallback hoặc warning
 *
 * Cần GEMINI_API_KEYS trong env để test OCR thật.
 */
import * as fs from "fs";
import * as path from "path";
for (const envName of [".env", ".env.local"]) {
  const f = path.join(__dirname, "..", envName);
  if (fs.existsSync(f))
    for (const line of fs.readFileSync(f, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) {
        let v = m[2].trim();
        if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
        process.env[m[1]] = v;
      }
    }
}

import { extractTextFromFile } from "../lib/document-extractor";
import { classifyDocument } from "../lib/ai-agents/document-classifier";
import { isOCRAvailable } from "../lib/pdf-ocr";

async function main() {
  console.log("OCR available:", isOCRAvailable());

  // Test 1: TXT file (simple)
  console.log("\n=== Test 1: TXT file ===");
  const txtContent = `ỦY BAN NHÂN DÂN XÃ TRẦN PHÚ
Số: 100/UBND-KT

V/v khẩn cấp triển khai phòng chống dịch bệnh trên đàn vật nuôi

Kính gửi: Phòng Kinh Tế

Yêu cầu Phòng Kinh Tế phối hợp với Trạm Thú y kiểm tra ngay các hộ chăn nuôi
trên địa bàn trong vòng 48 giờ.

Cán bộ phụ trách thú y báo cáo về UBND xã trước ngày 18/05/2026.

Hà Nội, ngày 12 tháng 5 năm 2026`;

  const txtFile = new File([txtContent], "test-cong-van.txt", { type: "text/plain" });
  const r1 = await extractTextFromFile(txtFile);
  console.log("  text length:", r1.text.length);
  console.log("  pageCount:", r1.pageCount);
  console.log("  usedOCR:", r1.usedOCR);
  console.log("  warnings:", r1.warnings);
  if (r1.text.length < 100) throw new Error("TXT extract failed");

  const c1 = await classifyDocument(r1.text);
  console.log("  → routing:", c1.routing, "(expect UBND_DIRECTIVE)");
  console.log("  → urgency:", c1.urgency, "(expect KHAN_CAP)");
  console.log("  → fields:", c1.fields);
  console.log("  → suggestedDept:", c1.suggestedDept, "(expect NONG_NGHIEP_MOI_TRUONG)");
  console.log("  → action items:", c1.actionItems.length);

  // Test 2: PDF file thật (search trong public folder hoặc skip)
  console.log("\n=== Test 2: PDF file ===");
  const possiblePDFs = [
    path.join(__dirname, "..", "public", "sample.pdf"),
    path.join(__dirname, "..", "test-data", "sample.pdf"),
  ];
  const pdfPath = possiblePDFs.find((p) => fs.existsSync(p));
  if (!pdfPath) {
    console.log("  Skip - không có file PDF test sẵn (đặt public/sample.pdf để test)");
  } else {
    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfFile = new File([pdfBuffer as any], path.basename(pdfPath), {
      type: "application/pdf",
    });
    console.log(`  Test với ${path.basename(pdfPath)} (${(pdfBuffer.length / 1024).toFixed(1)} KB)`);
    const r2 = await extractTextFromFile(pdfFile);
    console.log("  text length:", r2.text.length);
    console.log("  pageCount:", r2.pageCount);
    console.log("  usedOCR:", r2.usedOCR);
    console.log("  warnings:", r2.warnings);
    if (r2.ocrInfo) {
      console.log(
        "  OCR info: batches=" +
          r2.ocrInfo.batchCount +
          ", fails=" +
          r2.ocrInfo.failedBatches.length +
          ", " +
          (r2.ocrInfo.durationMs / 1000).toFixed(1) +
          "s"
      );
    }
    console.log("  text preview:", r2.text.slice(0, 200) + "...");
  }

  // Test 3: Empty buffer (simulate corrupt PDF)
  console.log("\n=== Test 3: Empty buffer (error path) ===");
  const emptyFile = new File([new Uint8Array(0)], "empty.pdf", { type: "application/pdf" });
  try {
    const r3 = await extractTextFromFile(emptyFile);
    console.log("  text length:", r3.text.length);
    console.log("  warnings:", r3.warnings);
    console.log("  usedOCR:", r3.usedOCR);
  } catch (e: any) {
    console.log("  ✓ Throws as expected:", e?.message?.slice(0, 100));
  }

  console.log("\n✓ Pipeline tests done");
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
