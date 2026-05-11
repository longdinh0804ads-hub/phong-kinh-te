// Test rotator + Gemini direct
import * as fs from "fs";
import * as path from "path";

// Load .env.local manually
const envFile = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envFile)) {
  const content = fs.readFileSync(envFile, "utf8");
  for (const line of content.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) {
      const key = m[1];
      let val = m[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      process.env[key] = val;
    }
  }
  console.log("Loaded .env.local");
}

import { getGeminiRotator, getDeepSeekRotator } from "../lib/api-key-rotator";
import { GoogleGenerativeAI } from "@google/generative-ai";

async function main() {
  const gemini = getGeminiRotator();
  const deepseek = getDeepSeekRotator();

  console.log("=== Rotator status ===");
  console.log("Gemini:", JSON.stringify(gemini.status(), null, 2));
  console.log("DeepSeek:", JSON.stringify(deepseek.status(), null, 2));

  console.log("\n=== Test Gemini with rotation ===");
  try {
    const result = await gemini.runWithRotation(async (apiKey) => {
      console.log("Trying key:", apiKey.slice(0, 10) + "...");
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const r = await model.generateContent("Trả lời bằng JSON: {\"ok\": true}");
      return r.response.text();
    });
    console.log("Response:", result);
  } catch (e: any) {
    console.error("All keys failed:", e?.message);
    console.log("Status after failure:", JSON.stringify(gemini.status(), null, 2));
  }

  console.log("\n=== Round-robin test (10 calls) ===");
  for (let i = 0; i < 10; i++) {
    const key = gemini.getNext();
    console.log(`Call ${i + 1}: ${key?.slice(0, 12)}...`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
