// Test full workflow: PENDING → IN_PROGRESS → AWAITING_REVIEW → COMPLETED
// + permission checks (TP không update progress, assignee không confirm, etc.)
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
import { executeTool } from "../lib/ai-tools/registry";
import { isDryRunResult, PENDING_ACTION_KEY } from "../lib/ai-tools/types";

function divider(s: string) {
  console.log("\n" + "=".repeat(70));
  console.log(s);
  console.log("=".repeat(70));
}
function check(label: string, cond: boolean, detail?: string) {
  console.log(`${cond ? "✓" : "✗"} ${label}${detail ? " — " + detail : ""}`);
  if (!cond) process.exitCode = 1;
}

async function main() {
  const tp = await db.user.findFirst({
    where: { role: "TRUONG_PHONG", isActive: true },
    select: {
      id: true,
      name: true,
      role: true,
      teamGroupCode: true,
      department: true,
      managedDepartments: true,
    },
  });
  const assignee = await db.user.findFirst({
    where: {
      id: { not: tp?.id },
      isActive: true,
      role: { in: ["CHUYEN_VIEN", "NHAN_VIEN"] },
    },
    select: {
      id: true,
      name: true,
      role: true,
      teamGroupCode: true,
      department: true,
      managedDepartments: true,
    },
  });
  if (!tp || !assignee) {
    console.error("Need TP + assignee");
    process.exit(1);
  }
  console.log(`TP: ${tp.name}, Assignee: ${assignee.name}`);

  // Cleanup
  await db.task.deleteMany({ where: { title: { contains: "(WF-TEST)" } } });

  // Create a fresh task
  const dl = new Date(Date.now() + 7 * 86400_000);
  const task = await db.task.create({
    data: {
      title: "Thanh tra xây dựng (WF-TEST)",
      priority: "THUONG",
      deadline: dl,
      status: "PENDING",
      assigneeId: assignee.id,
      creatorId: tp.id,
      sourceType: "INTERNAL",
    },
  });
  console.log(`Created task: ${task.id}\n`);

  const ctxAssignee = {
    user: {
      id: assignee.id,
      role: assignee.role,
      name: assignee.name,
      teamGroupCode: assignee.teamGroupCode,
      department: assignee.department,
      managedDepartments: assignee.managedDepartments,
    },
    confirmed: true,
  };
  const ctxTP = {
    user: {
      id: tp.id,
      role: tp.role,
      name: tp.name,
      teamGroupCode: tp.teamGroupCode,
      department: tp.department,
      managedDepartments: tp.managedDepartments,
    },
    confirmed: true,
  };

  // ====== TEST 1: TP CANNOT update progress ======
  divider("TEST 1: TP gọi addProgressReport → REJECT");
  const r1 = await executeTool(
    "addProgressReport",
    { taskQuery: task.id, percentComplete: 30 },
    ctxTP
  );
  check(
    "TP bị reject khi update progress",
    !r1.success && r1.error!.includes("người được giao"),
    r1.error
  );

  // ====== TEST 2: TP CANNOT click "start" ======
  divider("TEST 2: TP gọi updateTaskStatus action=start → REJECT");
  const r2 = await executeTool(
    "updateTaskStatus",
    { taskQuery: task.id, action: "start" },
    ctxTP
  );
  check(
    "TP bị reject khi start task của assignee",
    !r2.success && r2.error!.includes("người được giao"),
    r2.error
  );

  // ====== TEST 3: Assignee clicks start ======
  divider("TEST 3: Assignee start → IN_PROGRESS");
  const r3 = await executeTool(
    "updateTaskStatus",
    { taskQuery: task.id, action: "start" },
    ctxAssignee
  );
  check("Assignee start thành công", r3.success);
  const t3 = await db.task.findUnique({ where: { id: task.id }, select: { status: true } });
  check(`Status = IN_PROGRESS`, t3?.status === "IN_PROGRESS", `actual: ${t3?.status}`);

  // ====== TEST 4: Assignee update progress 50% ======
  divider("TEST 4: Assignee report 50%");
  const r4 = await executeTool(
    "addProgressReport",
    {
      taskQuery: task.id,
      percentComplete: 50,
      notes: "Đã đi kiểm tra hộ 1, 2",
    },
    ctxAssignee
  );
  check("Báo cáo 50% thành công", r4.success);
  const reports = await db.progressReport.findMany({
    where: { taskId: task.id },
    select: { percentComplete: true },
  });
  check("Có 1 progress report", reports.length === 1);

  // ====== TEST 5: Assignee submit ======
  divider("TEST 5: Assignee submit → AWAITING_REVIEW");
  const r5 = await executeTool(
    "updateTaskStatus",
    { taskQuery: task.id, action: "submit" },
    ctxAssignee
  );
  check("Submit thành công", r5.success);
  const t5 = await db.task.findUnique({
    where: { id: task.id },
    select: { status: true, submittedAt: true },
  });
  check(`Status = AWAITING_REVIEW`, t5?.status === "AWAITING_REVIEW");
  check(`submittedAt được set`, t5?.submittedAt !== null);

  // ====== TEST 6: Assignee CANNOT confirm ======
  divider("TEST 6: Assignee gọi confirm → REJECT");
  const r6 = await executeTool(
    "updateTaskStatus",
    { taskQuery: task.id, action: "confirm" },
    ctxAssignee
  );
  check(
    "Assignee bị reject khi confirm",
    !r6.success && r6.error!.includes("Trưởng phòng"),
    r6.error
  );

  // ====== TEST 7: Assignee CANNOT update progress khi AWAITING_REVIEW ======
  divider("TEST 7: Assignee update progress khi AWAITING_REVIEW → REJECT");
  const r7 = await executeTool(
    "addProgressReport",
    { taskQuery: task.id, percentComplete: 80 },
    ctxAssignee
  );
  check(
    "Assignee bị reject khi update progress lúc AWAITING_REVIEW",
    !r7.success,
    r7.error
  );

  // ====== TEST 8: TP rejects ======
  divider("TEST 8: TP reject (yêu cầu làm lại) → IN_PROGRESS");
  const r8 = await executeTool(
    "updateTaskStatus",
    {
      taskQuery: task.id,
      action: "reject",
      reason: "Thiếu biên bản kiểm tra",
    },
    ctxTP
  );
  check("Reject thành công", r8.success);
  const t8 = await db.task.findUnique({
    where: { id: task.id },
    select: { status: true, submittedAt: true },
  });
  check(`Status = IN_PROGRESS (back)`, t8?.status === "IN_PROGRESS");
  check(`submittedAt được clear`, t8?.submittedAt === null);

  // ====== TEST 9: Assignee submit lại, TP confirm ======
  divider("TEST 9: Assignee submit lại + TP confirm → COMPLETED");
  await executeTool(
    "updateTaskStatus",
    { taskQuery: task.id, action: "submit" },
    ctxAssignee
  );
  const r9 = await executeTool(
    "updateTaskStatus",
    { taskQuery: task.id, action: "confirm" },
    ctxTP
  );
  check("TP confirm thành công", r9.success);
  const t9 = await db.task.findUnique({
    where: { id: task.id },
    select: { status: true, completedAt: true, confirmedById: true, confirmedAt: true },
  });
  check(`Status = COMPLETED`, t9?.status === "COMPLETED");
  check(`completedAt được set`, t9?.completedAt !== null);
  check(`confirmedById = TP`, t9?.confirmedById === tp.id);
  check(`confirmedAt được set`, t9?.confirmedAt !== null);

  // ====== TEST 10: Assignee CANNOT start lại task đã COMPLETED ======
  divider("TEST 10: Action trên COMPLETED task → REJECT");
  const r10a = await executeTool(
    "updateTaskStatus",
    { taskQuery: task.id, action: "start" },
    ctxAssignee
  );
  check("Không start được COMPLETED task", !r10a.success, r10a.error);

  // ====== TEST 11: 100% report tự động chuyển AWAITING_REVIEW ======
  divider("TEST 11: 100% progress report → AWAITING_REVIEW (auto)");
  const task2 = await db.task.create({
    data: {
      title: "Task auto-submit 100% (WF-TEST)",
      priority: "THUONG",
      deadline: dl,
      status: "IN_PROGRESS",
      startedAt: new Date(),
      assigneeId: assignee.id,
      creatorId: tp.id,
      sourceType: "INTERNAL",
    },
  });
  const r11 = await executeTool(
    "addProgressReport",
    { taskQuery: task2.id, percentComplete: 100, notes: "Done" },
    ctxAssignee
  );
  check("Báo cáo 100% thành công", r11.success);
  const t11 = await db.task.findUnique({
    where: { id: task2.id },
    select: { status: true, submittedAt: true },
  });
  check(
    `Status auto = AWAITING_REVIEW (không phải COMPLETED)`,
    t11?.status === "AWAITING_REVIEW"
  );
  check(`submittedAt auto set`, t11?.submittedAt !== null);

  // ====== Cleanup ======
  divider("Cleanup");
  await db.notification.deleteMany({
    where: { message: { contains: "(WF-TEST)" } },
  });
  await db.task.deleteMany({ where: { title: { contains: "(WF-TEST)" } } });
  console.log("Cleaned up");

  if (process.exitCode === 1) {
    console.log("\n✗ MỘT SỐ TEST FAIL");
  } else {
    console.log("\n✓ TẤT CẢ TEST PASS");
  }
  process.exit(process.exitCode || 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
