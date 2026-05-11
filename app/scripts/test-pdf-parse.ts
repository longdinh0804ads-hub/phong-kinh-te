// Test pdf-parse + VN legal parser với file PDF thật
import * as fs from "fs";
import { parseVNLegalDocument } from "../lib/vn-legal-parser";

async function main() {
  const pdfPath = "C:/temp_qd.pdf"; // Đã copy sẵn (tránh đường dẫn unicode)
  if (!fs.existsSync(pdfPath)) {
    console.error("File not found:", pdfPath);
    process.exit(1);
  }

  // pdf-parse v2 API
  const { PDFParse } = await import("pdf-parse");
  const buffer = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: buffer });
  const data = await parser.getText();

  console.log("=== PDF text (first 2500 chars) ===");
  console.log(data.text.slice(0, 2500));
  console.log("\n=== Total length:", data.text.length, "chars ===");

  console.log("\n=== Parser result ===");
  const result = parseVNLegalDocument(data.text);
  console.log("docType:", result.docType);
  console.log("docNumber:", result.docNumber);
  console.log("title:", result.title);
  console.log("issuedDate:", result.issuedDate);
  console.log("effectiveDate:", result.effectiveDate);
  console.log("warnings:", result.warnings);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
