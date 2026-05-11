// Test OCR Gemini với file PDF
import * as fs from "fs";
import * as path from "path";

const envFile = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) {
      let val = m[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      process.env[m[1]] = val;
    }
  }
}

import { ocrPDFWithGemini } from "../lib/pdf-ocr";

async function main() {
  const pdfPath = process.argv[2] || "C:/temp_qd.pdf";
  if (!fs.existsSync(pdfPath)) {
    console.error("File not found:", pdfPath);
    process.exit(1);
  }

  const buffer = fs.readFileSync(pdfPath);
  console.log(`File: ${pdfPath} (${(buffer.length / 1024).toFixed(0)} KB)`);
  console.log("Calling OCR...");

  const startTime = Date.now();
  const text = await ocrPDFWithGemini(buffer);
  const duration = Date.now() - startTime;

  if (!text) {
    console.error("OCR FAILED - returned null");
    process.exit(1);
  }

  console.log(`\n=== OCR result (${duration}ms) ===`);
  console.log(`Text length: ${text.length} chars`);
  console.log(`First 1500 chars:\n${text.slice(0, 1500)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
