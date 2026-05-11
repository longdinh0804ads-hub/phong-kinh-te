// Test AI Agent với tool calling
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
  // Lấy 1 user TRUONG_PHONG để test
  const tp = await db.user.findFirst({
    where: { role: "TRUONG_PHONG", isActive: true },
    select: {
      id: true,
      name: true,
      role: true,
      position: true,
      teamGroupCode: true,
      department: true,
      managedDepartments: true,
    },
  });
  if (!tp) {
    console.error("Không tìm thấy Trưởng phòng để test");
    process.exit(1);
  }

  const provider = getActiveProvider();
  console.log(`Provider: ${provider}`);
  console.log(`User test: ${tp.name} (${tp.role})\n`);

  const queries = [
    "có ai chưa có việc gì làm không",
    "kiểm tra toàn bộ phòng xem ai rảnh",
    "ai đang quá tải nhất?",
    "workload toàn phòng thế nào?",
  ];

  for (const q of queries) {
    console.log("=".repeat(70));
    console.log(`Q: ${q}`);
    console.log("=".repeat(70));

    let finalText = "";
    const toolCalls: string[] = [];

    try {
      finalText = await runAgentLoop({
        provider: provider!,
        systemPrompt: buildAgentSystemPrompt(tp),
        messages: [{ role: "user", content: q }],
        ctx: {
          user: {
            id: tp.id,
            role: tp.role,
            name: tp.name,
            teamGroupCode: tp.teamGroupCode,
            department: tp.department,
            managedDepartments: tp.managedDepartments,
          },
        },
        onText: () => {
          // Không stream trong test, collect ở finalText return
        },
        onToolCall: (toolName, input) => {
          toolCalls.push(toolName);
          console.log(`  → Tool: ${toolName}(${JSON.stringify(input)})`);
        },
        onToolResult: (toolName, success) => {
          console.log(`  ← ${toolName}: ${success ? "OK" : "FAIL"}`);
        },
      });

      console.log(`\nA: ${finalText.slice(0, 500)}${finalText.length > 500 ? "..." : ""}`);
      console.log(`\nTools used: ${toolCalls.join(", ") || "(none)"}`);
    } catch (e: any) {
      console.error("  ✗ Error:", e?.message);
    }

    console.log();
  }

  // Verify audit log
  const recentLogs = await db.aIAuditLog.findMany({
    where: { userId: tp.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { action: true, success: true, duration: true, errorMsg: true },
  });
  console.log("=".repeat(70));
  console.log("Audit log (10 entries gần nhất):");
  for (const l of recentLogs) {
    console.log(`  ${l.success ? "✓" : "✗"} ${l.action} (${l.duration}ms)${l.errorMsg ? " - " + l.errorMsg : ""}`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
