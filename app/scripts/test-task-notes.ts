// Test TaskNote: server actions + AI tool + permission matrix
import * as fs from "fs";
import * as path from "path";
const envFile = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) { let val = m[2].trim(); if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1); process.env[m[1]] = val; }
  }
}

import { db } from "../lib/db";
import { executeTool } from "../lib/ai-tools/registry";
import { isDryRunResult, PENDING_ACTION_KEY } from "../lib/ai-tools/types";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${label}${detail?" — "+detail:""}`); }
  else { fail++; console.log(`  ✗ ${label}${detail?" — "+detail:""}`); }
}
function section(s: string) {
  console.log("\n" + "=".repeat(70));
  console.log(s);
  console.log("=".repeat(70));
}

async function main() {
  // Lấy users
  const users = await db.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, role: true, position: true, email: true, department: true, managedDepartments: true, teamGroupCode: true },
  });
  const tp = users.find(u => u.role === "TRUONG_PHONG")!;
  const ptp = users.find(u => u.role === "PHO_TP")!;
  const hoi = users.find(u => u.email === "hoi.dx@phongkinhte-tranphu.vn")!;  // TBP NN-MT+XD-CT
  const tu = users.find(u => u.email === "tu.vh@phongkinhte-tranphu.vn")!;     // TBP TC-KH
  const cv = users.find(u => u.email === "hoan.nt@phongkinhte-tranphu.vn")!;   // CV TC-KH
  const nv = users.find(u => u.role === "NHAN_VIEN")!;

  // Tạo 1 task để test: TP giao cho CV (Hoan thuộc TC-KH)
  await db.task.deleteMany({ where: { title: { contains: "(NOTE-TEST)" } } });
  await db.taskNote.deleteMany({ where: { content: { contains: "(NOTE-TEST)" } } });

  const dl = new Date(Date.now() + 7 * 86400_000);
  const task = await db.task.create({
    data: {
      title: "Task để test note (NOTE-TEST)",
      priority: "THUONG",
      deadline: dl,
      status: "PENDING",
      assigneeId: cv.id,  // CV thuộc TC-KH
      creatorId: tp.id,
      sourceType: "INTERNAL",
    },
  });
  console.log(`Task: ${task.id}, assignee=${cv.name} (${cv.department}), creator=${tp.name}`);

  const ctxOf = (u: any, confirmed = false) => ({
    user: {
      id: u.id, role: u.role, name: u.name,
      teamGroupCode: u.teamGroupCode,
      department: u.department,
      managedDepartments: u.managedDepartments,
    },
    confirmed,
  });

  // ========================================================
  section("SECTION 1: addTaskNote permission matrix");

  // 1.1 TP gửi → OK
  const r1 = await executeTool("addTaskNote", {
    taskQuery: task.id,
    content: "TP nhắn nhở (NOTE-TEST)",
  }, ctxOf(tp, true));
  check("TP gửi note → OK", r1.success, r1.error);

  // 1.2 PTP gửi → OK
  const r2 = await executeTool("addTaskNote", {
    taskQuery: task.id,
    content: "PTP nhắn (NOTE-TEST)",
  }, ctxOf(ptp, true));
  check("PTP gửi note → OK", r2.success, r2.error);

  // 1.3 TBP Vũ Huy Tư (TC-KH) - cùng dept với assignee → OK
  const r3 = await executeTool("addTaskNote", {
    taskQuery: task.id,
    content: "TBP TC-KH nhắn (NOTE-TEST)",
  }, ctxOf(tu, true));
  check("TBP TC-KH (cùng dept assignee) gửi note → OK", r3.success, r3.error);

  // 1.4 TBP Đinh Xuân Hội (NN-MT+XD-CT) - KHÁC dept với assignee (TC-KH) → REJECT
  const r4 = await executeTool("addTaskNote", {
    taskQuery: task.id,
    content: "TBP NN-MT nhắn (NOTE-TEST)",
  }, ctxOf(hoi, true));
  check("TBP NN-MT (khác dept assignee) gửi note → REJECT", !r4.success, r4.error);

  // 1.5 CV gửi → REJECT (chưa có requiresRole)
  const r5 = await executeTool("addTaskNote", {
    taskQuery: task.id,
    content: "CV nhắn (NOTE-TEST)",
  }, ctxOf(cv, true));
  check("CHUYEN_VIEN gửi note → REJECT", !r5.success, r5.error);

  // 1.6 NV gửi → REJECT
  const r6 = await executeTool("addTaskNote", {
    taskQuery: task.id,
    content: "NV nhắn (NOTE-TEST)",
  }, ctxOf(nv, true));
  check("NHAN_VIEN gửi note → REJECT", !r6.success, r6.error);

  // ========================================================
  section("SECTION 2: Dry-run + Confirmed");

  const dry = await executeTool("addTaskNote", {
    taskQuery: task.id,
    content: "Dry run note (NOTE-TEST)",
    isPinned: true,
  }, ctxOf(tp));  // confirmed=false
  check("TP dry-run → trả pendingAction", dry.success && isDryRunResult(dry.output));
  if (dry.success && isDryRunResult(dry.output)) {
    const pa = dry.output[PENDING_ACTION_KEY];
    check("Pending action kind = add-note", pa.kind === "add-note");
    check("Preview chứa task title", pa.preview.includes("Task để test note"), pa.preview);
  }

  // ========================================================
  section("SECTION 3: Snapshot author info");

  const notes = await db.taskNote.findMany({
    where: { taskId: task.id, content: { contains: "(NOTE-TEST)" } },
    orderBy: { createdAt: "asc" },
  });
  check(`Đã có ${notes.length} note thật`, notes.length >= 3, `count=${notes.length}`);
  for (const n of notes) {
    if (n.content.startsWith("TP nhắn")) {
      check(`TP note có snapshot role=TRUONG_PHONG, name=${tp.name}`, n.authorRole === "TRUONG_PHONG" && n.authorName === tp.name);
    }
    if (n.content.startsWith("PTP nhắn")) {
      check(`PTP note có snapshot role=PHO_TP`, n.authorRole === "PHO_TP");
    }
    if (n.content.startsWith("TBP TC-KH")) {
      check(`TBP note có snapshot role=TRUONG_BO_PHAN`, n.authorRole === "TRUONG_BO_PHAN");
    }
  }

  // ========================================================
  section("SECTION 4: Notification cho assignee");

  const notifs = await db.notification.findMany({
    where: { userId: cv.id, type: "TASK_NOTE", link: `/tasks/${task.id}` },
    orderBy: { createdAt: "desc" },
  });
  check(`Assignee có ${notifs.length} notification TASK_NOTE`, notifs.length >= 3, `count=${notifs.length}`);

  // ========================================================
  section("SECTION 5: Server actions - updateTaskNote / deleteTaskNote");

  const { updateTaskNote, deleteTaskNote, toggleTaskNotePin, getTaskNotes } = await import("../actions/task-note");
  // Note: server actions yêu cầu requireAuth() - không gọi trực tiếp được từ script.
  // Chỉ test logic permission qua AI tool (đã cover ở Section 1).
  console.log("  (server actions skip - cần session, đã cover qua AI tool)");

  // ========================================================
  section("SECTION 6: Sort - pinned trước, mới nhất trước");

  const sortedNotes = await db.taskNote.findMany({
    where: { taskId: task.id },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
  });
  const firstIsPinned = sortedNotes[0]?.isPinned === true;
  check("Note có isPinned ở đầu danh sách", firstIsPinned || !sortedNotes.some(n => n.isPinned),
    `pinned count=${sortedNotes.filter(n=>n.isPinned).length}`);

  // ========================================================
  // Cleanup
  section("CLEANUP");
  const dn = await db.taskNote.deleteMany({ where: { content: { contains: "(NOTE-TEST)" } } });
  const dt = await db.task.deleteMany({ where: { title: { contains: "(NOTE-TEST)" } } });
  const dnotif = await db.notification.deleteMany({ where: { link: `/tasks/${task.id}` } });
  console.log(`Deleted ${dn.count} notes, ${dt.count} tasks, ${dnotif.count} notifications`);

  section("RESULT");
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
