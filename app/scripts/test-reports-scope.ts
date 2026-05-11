// Test: verify scope filter trong /reports/* pages cho TRUONG_BO_PHAN
// Mô phỏng query DB y hệt pages dùng, đảm bảo TBP KHÔNG thấy được người ngoài dept.

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
import { getManagedDepartments } from "../lib/permissions";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}${detail ? " — " + detail : ""}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}${detail ? " — " + detail : ""}`);
  }
}
function section(s: string) {
  console.log("\n" + "=".repeat(70));
  console.log(s);
  console.log("=".repeat(70));
}

async function main() {
  // Lấy Đinh Xuân Hội (TBP với 2 managedDepartments) làm test case chính
  const hoi = await db.user.findFirst({
    where: { email: "hoi.dx@phongkinhte-tranphu.vn" },
    select: {
      id: true,
      name: true,
      role: true,
      department: true,
      managedDepartments: true,
    },
  });
  if (!hoi) {
    console.error("Không tìm thấy Đinh Xuân Hội");
    process.exit(1);
  }

  // Vũ Huy Tư (TBP với 1 dept TAI_CHINH_KE_HOACH)
  const tu = await db.user.findFirst({
    where: { email: "tu.vh@phongkinhte-tranphu.vn" },
    select: {
      id: true,
      name: true,
      role: true,
      department: true,
      managedDepartments: true,
    },
  });
  if (!tu) {
    console.error("Không tìm thấy Vũ Huy Tư");
    process.exit(1);
  }

  console.log(`Test với 2 Trưởng bộ phận:`);
  console.log(
    `  - ${hoi.name} (${hoi.department}, managed=${JSON.stringify(hoi.managedDepartments)})`
  );
  console.log(
    `  - ${tu.name} (${tu.department}, managed=${JSON.stringify(tu.managedDepartments)})`
  );

  // ========================================================
  // SECTION 1: /reports/tasks - task report scope
  // ========================================================
  section("SECTION 1: /reports/tasks - TBP chỉ thấy task của dept mình");

  for (const tbp of [hoi, tu]) {
    const managed = getManagedDepartments(tbp);
    const taskWhere: any = {
      deletedAt: null,
      OR: [
        { assignee: { department: { in: managed } } },
        { creator: { department: { in: managed } } },
      ],
    };
    const tasks = await db.task.findMany({
      where: taskWhere,
      include: {
        assignee: { select: { department: true, name: true } },
        creator: { select: { department: true, name: true } },
      },
      take: 200,
    });
    // Mọi task trong list phải có assignee/creator thuộc managed depts
    const allValid = tasks.every(
      (t) =>
        (t.assignee && managed.includes(t.assignee.department)) ||
        (t.creator && managed.includes(t.creator.department))
    );
    check(
      `${tbp.name} (${managed.join(", ")}): ${tasks.length} task, mọi task trong dept`,
      allValid
    );

    // So sánh với tổng số task của phòng
    const totalAll = await db.task.count({ where: { deletedAt: null } });
    check(
      `${tbp.name}: KHÔNG xem được toàn bộ (${tasks.length} < ${totalAll})`,
      tasks.length < totalAll || totalAll === 0,
      `phòng có ${totalAll} task`
    );
  }

  // ========================================================
  // SECTION 2: /reports/performance - cán bộ scope
  // ========================================================
  section("SECTION 2: /reports/performance - TBP chỉ thấy cán bộ dept mình");

  for (const tbp of [hoi, tu]) {
    const managed = getManagedDepartments(tbp);
    const users = await db.user.findMany({
      where: { isActive: true, department: { in: managed } },
      select: { name: true, department: true, role: true },
    });
    const allValid = users.every((u) => managed.includes(u.department));
    check(
      `${tbp.name}: ${users.length} cán bộ trong scope, mọi user thuộc managed depts`,
      allValid
    );

    // KHÔNG được thấy TRUONG_PHONG
    const seesTP = users.some((u) => u.role === "TRUONG_PHONG");
    check(
      `${tbp.name}: KHÔNG thấy Trưởng phòng`,
      !seesTP,
      seesTP ? "BUG: xem được TP" : "OK"
    );

    // KHÔNG thấy user dept khác
    const totalAll = await db.user.count({ where: { isActive: true } });
    check(
      `${tbp.name}: ${users.length} < tổng ${totalAll} cán bộ phòng`,
      users.length < totalAll,
      "scope giới hạn đúng"
    );
  }

  // ========================================================
  // SECTION 3: /reports/schedule - lịch scope
  // ========================================================
  section("SECTION 3: /reports/schedule - TBP chỉ thấy lịch dept mình");

  // Lấy week + year hiện tại
  const nowYear = new Date().getFullYear();
  // ISO week của hôm nay
  const d = new Date(
    Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

  for (const tbp of [hoi, tu]) {
    const managed = getManagedDepartments(tbp);
    const schedules = await db.workSchedule.findMany({
      where: {
        year: nowYear,
        weekNumber: weekNo,
        user: { department: { in: managed } },
      },
      include: { user: { select: { department: true, name: true } } },
    });
    const allValid = schedules.every(
      (s) => s.user && managed.includes(s.user.department)
    );
    check(
      `${tbp.name}: ${schedules.length} schedule tuần này, mọi lịch thuộc dept`,
      allValid
    );
  }

  // ========================================================
  // SECTION 4: /reports/ubnd - UBND scope
  // ========================================================
  section("SECTION 4: /reports/ubnd - TBP chỉ thấy UBND giao vào dept");

  for (const tbp of [hoi, tu]) {
    const managed = getManagedDepartments(tbp);
    const directives = await db.uBNDDirective.findMany({
      where: {
        deletedAt: null,
        assignee: { department: { in: managed } },
      },
      include: {
        assignee: { select: { name: true, department: true } },
      },
    });
    const allValid = directives.every(
      (d) => d.assignee && managed.includes(d.assignee.department)
    );
    check(
      `${tbp.name}: ${directives.length} UBND directive trong scope, đều có assignee thuộc dept`,
      allValid
    );
  }

  // ========================================================
  // SECTION 5: /reports (overview) - tổng quan stats scope
  // ========================================================
  section("SECTION 5: /reports overview - TBP scope tổng quan");

  for (const tbp of [hoi, tu]) {
    const managed = getManagedDepartments(tbp);
    const taskWhere = {
      deletedAt: null,
      OR: [
        { assignee: { department: { in: managed } } },
        { creator: { department: { in: managed } } },
      ],
    };
    const cntTBP = await db.task.count({ where: taskWhere });
    const cntAll = await db.task.count({ where: { deletedAt: null } });
    check(
      `${tbp.name}: count theo dept (${cntTBP}) < total phòng (${cntAll})`,
      cntTBP < cntAll || cntAll === 0
    );
  }

  // ========================================================
  // SECTION 6: Cross-dept không leak từ Đinh Xuân Hội (2 dept)
  // ========================================================
  section("SECTION 6: Đinh Xuân Hội (NN-MT + XD-CT) không thấy TAI_CHINH");

  const tcUsers = await db.user.findMany({
    where: { department: "TAI_CHINH_KE_HOACH", isActive: true },
    select: { id: true, name: true },
  });
  console.log(
    `Bộ phận Tài chính có ${tcUsers.length} người: ${tcUsers.map((u) => u.name).join(", ")}`
  );

  const hoiManaged = getManagedDepartments(hoi);
  const hoiVisible = await db.user.findMany({
    where: { isActive: true, department: { in: hoiManaged } },
    select: { name: true, department: true },
  });
  const sawTCH = hoiVisible.some((u) => u.department === "TAI_CHINH_KE_HOACH");
  check(
    `Đinh Xuân Hội: KHÔNG thấy cán bộ TAI_CHINH_KE_HOACH`,
    !sawTCH,
    `visible: ${hoiVisible.map((u) => u.department).join(", ")}`
  );

  section("RESULT");
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
