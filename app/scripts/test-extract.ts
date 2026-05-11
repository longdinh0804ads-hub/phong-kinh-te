// Debug AI metadata extraction
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

import { extractLegalMetadataWithAI } from "../lib/ai-legal-extract";

async function main() {
  const buffer = fs.readFileSync("C:/temp_qd.pdf");
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  const { text } = await parser.getText();

  console.log("Text length:", text.length);
  console.log("First 800 chars:", text.slice(0, 800));
  console.log("\n=== Calling AI extract... ===");

  const result = await extractLegalMetadataWithAI(text);
  console.log("docType:", result.docType);
  console.log("docNumber:", result.docNumber);
  console.log("title:", result.title?.slice(0, 200));
  console.log("issuedDate:", result.issuedDate);
  console.log("effectiveDate:", result.effectiveDate);
  console.log("warnings:", result.warnings);
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
