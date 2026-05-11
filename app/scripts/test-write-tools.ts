// Test write tools (createTask, updateTaskStatus, addProgressReport, createReminder)
// Test cả dry-run mode (default) lẫn confirmed mode.

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

function divider(label: string) {
  console.log("\n" + "=".repeat(70));
  console.log(label);
  console.log("=".repeat(70));
}

async function main() {
  // Lấy TRUONG_PHONG để test
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
  if (!tp) {
    console.error("Không tìm thấy Trưởng phòng để test");
    process.exit(1);
  }
  console.log(`Test user: ${tp.name} (${tp.role})`);

  const ctxDry = {
    user: {
      id: tp.id,
      role: tp.role,
      name: tp.name,
      teamGroupCode: tp.teamGroupCode,
      department: tp.department,
      managedDepartments: tp.managedDepartments,
    },
  };
  const ctxConfirmed = { ...ctxDry, confirmed: true };

  // Tìm 1 cán bộ khác để giao việc
  const target = await db.user.findFirst({
    where: { id: { not: tp.id }, isActive: true, role: { in: ["CHUYEN_VIEN", "NHAN_VIEN"] } },
    select: { id: true, name: true },
  });
  if (!target) {
    console.error("Không tìm thấy cán bộ để giao việc");
    process.exit(1);
  }
  console.log(`Target user: ${target.name}`);

  // =====================================================
  // TEST 1: createTask - DRY RUN
  // =====================================================
  divider("TEST 1: createTask DRY RUN");
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + 7);
  deadline.setHours(17, 0, 0, 0);

  const dryResult = await executeTool(
    "createTask",
    {
      title: "Kiểm tra ATTP thôn Văn Sơn (TEST)",
      description: "Test tạo task qua AI agent",
      assigneeQuery: target.name,
      deadline: deadline.toISOString(),
      priority: "CAO",
    },
    ctxDry
  );
  console.log("Success:", dryResult.success);
  if (dryResult.success) {
    if (isDryRunResult(dryResult.output)) {
      const pa = dryResult.output[PENDING_ACTION_KEY];
      console.log("Preview:", pa.preview);
      console.log("Details:");
      for (const d of pa.details) console.log(`  - ${d.label}: ${d.value}`);
      console.log("Kind:", pa.kind);
    } else {
      console.log("⚠ Output không phải DryRunResult:", dryResult.output);
    }
  } else {
    console.log("Error:", dryResult.error);
  }

  // =====================================================
  // TEST 2: createTask - CONFIRMED (thực sự tạo)
  // =====================================================
  divider("TEST 2: createTask CONFIRMED");
  const created = await executeTool(
    "createTask",
    {
      title: "Kiểm tra ATTP thôn Văn Sơn (TEST AGENT)",
      description: "Task tạo từ test script",
      assigneeQuery: target.name,
      deadline: deadline.toISOString(),
      priority: "CAO",
    },
    ctxConfirmed
  );
  console.log("Success:", created.success);
  console.log("Output:", created.output);
  const newTaskId = created.output?.taskId;

  // =====================================================
  // TEST 3: updateTaskStatus DRY RUN
  // =====================================================
  if (newTaskId) {
    divider("TEST 3: updateTaskStatus DRY RUN");
    const upd = await executeTool(
      "updateTaskStatus",
      { taskQuery: newTaskId, status: "IN_PROGRESS" },
      ctxDry
    );
    if (upd.success && isDryRunResult(upd.output)) {
      const pa = upd.output[PENDING_ACTION_KEY];
      console.log("Preview:", pa.preview);
      for (const d of pa.details) console.log(`  - ${d.label}: ${d.value}`);
    } else {
      console.log("Error:", upd.error || "Không phải dry-run result");
    }

    // =====================================================
    // TEST 4: updateTaskStatus CONFIRMED
    // =====================================================
    divider("TEST 4: updateTaskStatus CONFIRMED");
    const updDone = await executeTool(
      "updateTaskStatus",
      { taskQuery: newTaskId, status: "IN_PROGRESS" },
      ctxConfirmed
    );
    console.log("Success:", updDone.success);
    console.log("Output:", updDone.output);

    // =====================================================
    // TEST 5: addProgressReport DRY RUN
    // =====================================================
    divider("TEST 5: addProgressReport DRY RUN");
    const rep = await executeTool(
      "addProgressReport",
      { taskQuery: newTaskId, percentComplete: 50, notes: "Đã đi kiểm tra 2 hộ" },
      ctxDry
    );
    if (rep.success && isDryRunResult(rep.output)) {
      const pa = rep.output[PENDING_ACTION_KEY];
      console.log("Preview:", pa.preview);
      for (const d of pa.details) console.log(`  - ${d.label}: ${d.value}`);
    } else {
      console.log("Error:", rep.error || "Không phải dry-run");
    }

    // =====================================================
    // TEST 6: addProgressReport CONFIRMED
    // =====================================================
    divider("TEST 6: addProgressReport CONFIRMED");
    const repDone = await executeTool(
      "addProgressReport",
      { taskQuery: newTaskId, percentComplete: 50, notes: "Đã đi kiểm tra 2 hộ" },
      ctxConfirmed
    );
    console.log("Success:", repDone.success);
    console.log("Output:", repDone.output);
  }

  // =====================================================
  // TEST 7: createReminder DRY RUN
  // =====================================================
  divider("TEST 7: createReminder DRY RUN");
  const meetTime = new Date();
  meetTime.setDate(meetTime.getDate() + 2);
  meetTime.setHours(9, 0, 0, 0);

  const rem = await executeTool(
    "createReminder",
    {
      title: "Họp lãnh đạo huyện (TEST)",
      scheduleDate: meetTime.toISOString(),
      location: "UBND huyện Ứng Hòa",
    },
    ctxDry
  );
  if (rem.success && isDryRunResult(rem.output)) {
    const pa = rem.output[PENDING_ACTION_KEY];
    console.log("Preview:", pa.preview);
    for (const d of pa.details) console.log(`  - ${d.label}: ${d.value}`);
  } else {
    console.log("Error:", rem.error);
  }

  // =====================================================
  // TEST 8: createReminder CONFIRMED
  // =====================================================
  divider("TEST 8: createReminder CONFIRMED");
  const remDone = await executeTool(
    "createReminder",
    {
      title: "Họp lãnh đạo huyện (TEST AGENT)",
      scheduleDate: meetTime.toISOString(),
      location: "UBND huyện Ứng Hòa",
    },
    ctxConfirmed
  );
  console.log("Success:", remDone.success);
  console.log("Output:", remDone.output);

  // =====================================================
  // TEST 9: Error cases
  // =====================================================
  divider("TEST 9: Error cases");

  // Deadline đã quá hạn
  const past = new Date();
  past.setDate(past.getDate() - 1);
  const errPast = await executeTool(
    "createTask",
    {
      title: "Task quá khứ",
      assigneeQuery: target.name,
      deadline: past.toISOString(),
      priority: "THUONG",
    },
    ctxDry
  );
  console.log("Deadline quá hạn:", errPast.error);

  // Assignee không tồn tại
  const errNoUser = await executeTool(
    "createTask",
    {
      title: "Task không có người",
      assigneeQuery: "NgườiKhôngTồnTại12345",
      deadline: deadline.toISOString(),
      priority: "THUONG",
    },
    ctxDry
  );
  console.log("User không tồn tại:", errNoUser.error);

  // Status transition không hợp lệ (COMPLETED → IN_PROGRESS)
  // Tìm 1 task đã COMPLETED
  const completedTask = await db.task.findFirst({
    where: { status: "COMPLETED", deletedAt: null },
    select: { id: true, title: true },
  });
  if (completedTask) {
    const errTrans = await executeTool(
      "updateTaskStatus",
      { taskQuery: completedTask.id, status: "IN_PROGRESS" },
      ctxDry
    );
    console.log("Status transition không hợp lệ:", errTrans.error);
  }

  // =====================================================
  // Audit logs
  // =====================================================
  divider("Audit log (10 entries gần nhất)");
  const logs = await db.aIAuditLog.findMany({
    where: { userId: tp.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { tool: true, success: true, duration: true, errorMsg: true },
  });
  for (const l of logs) {
    console.log(
      `  ${l.success ? "✓" : "✗"} ${l.tool} (${l.duration}ms)${l.errorMsg ? " - " + l.errorMsg : ""}`
    );
  }

  // Cleanup test data
  divider("Cleanup test data");
  const delTasks = await db.task.deleteMany({
    where: { title: { contains: "(TEST AGENT)" } },
  });
  console.log(`Deleted ${delTasks.count} test tasks`);
  const delRems = await db.workSchedule.deleteMany({
    where: { title: { contains: "(TEST AGENT)" } },
  });
  console.log(`Deleted ${delRems.count} test reminders`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
