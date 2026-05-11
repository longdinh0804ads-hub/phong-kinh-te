// Test agent loop với write tools - end-to-end qua Gemini
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

import { db } from "../lib/db";
import { getActiveProvider } from "../lib/ai";
import { runAgentLoop } from "../lib/ai-tools/agent";
import { buildAgentSystemPrompt } from "../lib/ai-tools/system-prompt";

async function main() {
  const tp = await db.user.findFirst({
    where: { role: "TRUONG_PHONG", isActive: true },
    select: { id: true, name: true, role: true, position: true, teamGroupCode: true, department: true, managedDepartments: true },
  });
  if (!tp) {
    console.error("Không tìm thấy TP");
    process.exit(1);
  }

  const provider = getActiveProvider();
  console.log(`Provider: ${provider}`);
  console.log(`User: ${tp.name} (${tp.role})\n`);

  // Tìm 1 cán bộ khác
  const target = await db.user.findFirst({
    where: { id: { not: tp.id }, isActive: true, role: { in: ["CHUYEN_VIEN", "NHAN_VIEN"] } },
    select: { name: true },
  });
  console.log(`Sẽ giao cho: ${target?.name}\n`);

  const queries = [
    `Giao ${target?.name} kiểm tra ATTP thôn Văn Sơn, hạn ngày 20 tháng 5 năm 2026, mức ưu tiên cao`,
    "Nhắc tôi họp lãnh đạo huyện 9h sáng thứ 6 tuần này tại UBND huyện",
  ];

  for (const q of queries) {
    console.log("=".repeat(70));
    console.log(`Q: ${q}`);
    console.log("=".repeat(70));

    let finalText = "";
    const pendingActions: any[] = [];

    try {
      finalText = await runAgentLoop({
        provider: provider!,
        systemPrompt: buildAgentSystemPrompt(tp),
        messages: [{ role: "user", content: q }],
        ctx: {
          user: { id: tp.id, role: tp.role, name: tp.name, teamGroupCode: tp.teamGroupCode, department: tp.department, managedDepartments: tp.managedDepartments },
        },
        onText: () => {},
        onToolCall: (toolName, input) => {
          console.log(`  → Tool: ${toolName}(${JSON.stringify(input)})`);
        },
        onToolResult: (toolName, success) => {
          console.log(`  ← ${toolName}: ${success ? "OK" : "FAIL"}`);
        },
        onPendingAction: (action) => {
          pendingActions.push(action);
          console.log(`  📋 Pending action [${action.kind}]: ${action.preview}`);
        },
      });

      console.log(`\nA: ${finalText.slice(0, 400)}${finalText.length > 400 ? "..." : ""}`);
      console.log(`Pending actions: ${pendingActions.length}`);
    } catch (e: any) {
      console.error("✗ Error:", e?.message);
    }

    console.log();
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
