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

async function main() {
  const keys = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "").split(/[,;\s]+/).filter(Boolean);
  const key = keys[0];
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
  const res = await fetch(url);
  const data: any = await res.json();
  const models = data.models || [];
  console.log(`Total models: ${models.length}`);
  for (const m of models) {
    if (m.supportedGenerationMethods?.includes("embedContent") || /embed/i.test(m.name)) {
      console.log(`- ${m.name} | dim=${m.outputDimensionality || "?"} | methods=${m.supportedGenerationMethods?.join(",")}`);
    }
  }
}
main().catch(e => console.error(e));
