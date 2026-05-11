// Test RBAC permission matrix - per role.
// Verify:
// 1. TP/PTP: toàn quyền
// 2. TRUONG_BO_PHAN: chỉ scope dept (xem + giao)
// 3. CHUYEN_VIEN: chỉ task của mình, KHÔNG tạo task
// 4. NHAN_VIEN: thấp nhất, KHÔNG tạo task, KHÔNG xem iHanoi/TTHC

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
import {
  hasPermission,
  isTopLeader,
  isDeptManager,
  isStaff,
  getManagedDepartments,
} from "../lib/permissions";
import { executeTool } from "../lib/ai-tools/registry";
import type { Role } from "@prisma/client";

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
  // ========================================================
  // SECTION 1: Permission Matrix (unit tests, no DB)
  // ========================================================
  section("SECTION 1: PERMISSION MATRIX");

  console.log("\n[TRUONG_PHONG]");
  check("có task:create", hasPermission("TRUONG_PHONG", "task:create"));
  check("có task:assign:all", hasPermission("TRUONG_PHONG", "task:assign:all"));
  check("có user:manage", hasPermission("TRUONG_PHONG", "user:manage"));
  check("có legal:manage", hasPermission("TRUONG_PHONG", "legal:manage"));
  check("isTopLeader", isTopLeader("TRUONG_PHONG"));

  console.log("\n[PHO_TP]");
  check("có task:create", hasPermission("PHO_TP", "task:create"));
  check("có task:assign:all", hasPermission("PHO_TP", "task:assign:all"));
  check(
    "KHÔNG có user:manage",
    !hasPermission("PHO_TP", "user:manage"),
    "Phó TP không quản lý user"
  );
  check(
    "KHÔNG có legal:manage",
    !hasPermission("PHO_TP", "legal:manage"),
    "Phó TP không quản legal"
  );
  check("isTopLeader", isTopLeader("PHO_TP"));

  console.log("\n[TRUONG_BO_PHAN]");
  check("có task:create", hasPermission("TRUONG_BO_PHAN", "task:create"));
  check(
    "có task:assign:dept",
    hasPermission("TRUONG_BO_PHAN", "task:assign:dept")
  );
  check(
    "KHÔNG có task:assign:all",
    !hasPermission("TRUONG_BO_PHAN", "task:assign:all")
  );
  check(
    "KHÔNG có task:view:all",
    !hasPermission("TRUONG_BO_PHAN", "task:view:all")
  );
  check(
    "có task:view:dept",
    hasPermission("TRUONG_BO_PHAN", "task:view:dept")
  );
  check(
    "có user:view:dept",
    hasPermission("TRUONG_BO_PHAN", "user:view:dept")
  );
  check(
    "KHÔNG có user:manage",
    !hasPermission("TRUONG_BO_PHAN", "user:manage")
  );
  check(
    "KHÔNG có ubnd:create",
    !hasPermission("TRUONG_BO_PHAN", "ubnd:create")
  );
  check(
    "KHÔNG có task:approve (TP only)",
    !hasPermission("TRUONG_BO_PHAN", "task:approve")
  );
  check("isDeptManager", isDeptManager("TRUONG_BO_PHAN"));
  check(
    "isTopLeader FALSE",
    !isTopLeader("TRUONG_BO_PHAN"),
    "phải KHÔNG phải top leader"
  );

  console.log("\n[CHUYEN_VIEN]");
  check(
    "KHÔNG có task:create",
    !hasPermission("CHUYEN_VIEN", "task:create"),
    "Chuyên viên không tạo task"
  );
  check(
    "KHÔNG có task:assign:all/dept",
    !hasPermission("CHUYEN_VIEN", "task:assign:all") &&
      !hasPermission("CHUYEN_VIEN", "task:assign:dept")
  );
  check("có task:view:own", hasPermission("CHUYEN_VIEN", "task:view:own"));
  check(
    "KHÔNG có task:view:dept",
    !hasPermission("CHUYEN_VIEN", "task:view:dept")
  );
  check(
    "KHÔNG có user:view:all/dept",
    !hasPermission("CHUYEN_VIEN", "user:view:all") &&
      !hasPermission("CHUYEN_VIEN", "user:view:dept")
  );
  check(
    "có ihanoi:handle (xử lý khi giao)",
    hasPermission("CHUYEN_VIEN", "ihanoi:handle")
  );
  check(
    "có tthc:handle",
    hasPermission("CHUYEN_VIEN", "tthc:handle")
  );
  check(
    "có ai:full",
    hasPermission("CHUYEN_VIEN", "ai:full")
  );
  check("isStaff", isStaff("CHUYEN_VIEN"));

  console.log("\n[NHAN_VIEN]");
  check(
    "KHÔNG có task:create",
    !hasPermission("NHAN_VIEN", "task:create"),
    "Nhân viên không tạo task"
  );
  check("có task:view:own", hasPermission("NHAN_VIEN", "task:view:own"));
  check(
    "có ubnd:view:own",
    hasPermission("NHAN_VIEN", "ubnd:view:own"),
    "Nhân viên thấy UBND giao cho mình"
  );
  check(
    "KHÔNG có ihanoi:view:* (any)",
    !hasPermission("NHAN_VIEN", "ihanoi:view:all") &&
      !hasPermission("NHAN_VIEN", "ihanoi:view:dept") &&
      !hasPermission("NHAN_VIEN", "ihanoi:view:own"),
    "Nhân viên KHÔNG xem iHanoi"
  );
  check(
    "KHÔNG có tthc:view:* (any)",
    !hasPermission("NHAN_VIEN", "tthc:view:all") &&
      !hasPermission("NHAN_VIEN", "tthc:view:dept") &&
      !hasPermission("NHAN_VIEN", "tthc:view:own")
  );
  check(
    "có ai:limited (read-only, scope-restricted)",
    hasPermission("NHAN_VIEN", "ai:limited")
  );
  check(
    "có legal:view (tra cứu)",
    hasPermission("NHAN_VIEN", "legal:view")
  );
  check("isStaff", isStaff("NHAN_VIEN"));

  console.log("\n[getManagedDepartments]");
  check(
    "TP returns []",
    getManagedDepartments({
      role: "TRUONG_PHONG",
      department: "BAN_LANH_DAO",
    }).length === 0
  );
  check(
    "TRUONG_BO_PHAN default = [department]",
    JSON.stringify(
      getManagedDepartments({
        role: "TRUONG_BO_PHAN",
        department: "TAI_CHINH_KE_HOACH",
      })
    ) === JSON.stringify(["TAI_CHINH_KE_HOACH"])
  );
  check(
    "TRUONG_BO_PHAN với managedDepartments = list đó",
    JSON.stringify(
      getManagedDepartments({
        role: "TRUONG_BO_PHAN",
        department: "NONG_NGHIEP_MOI_TRUONG",
        managedDepartments: [
          "NONG_NGHIEP_MOI_TRUONG",
          "XAY_DUNG_CONG_THUONG",
        ],
      })
    ) ===
      JSON.stringify(["NONG_NGHIEP_MOI_TRUONG", "XAY_DUNG_CONG_THUONG"])
  );

  // ========================================================
  // SECTION 2: AI Tools - per role
  // ========================================================
  section("SECTION 2: AI TOOLS REQUIRES_ROLE");

  // Lấy 1 user của mỗi role
  const users = await db.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      role: true,
      teamGroupCode: true,
      department: true,
      managedDepartments: true,
    },
  });
  const byRole = (r: Role) => users.find((u) => u.role === r);
  const tp = byRole("TRUONG_PHONG")!;
  const ptp = byRole("PHO_TP")!;
  const tbp = byRole("TRUONG_BO_PHAN")!;
  const cv = byRole("CHUYEN_VIEN")!;
  const nv = byRole("NHAN_VIEN")!;
  console.log(`TP=${tp.name}, PTP=${ptp.name}, TBP=${tbp.name}, CV=${cv.name}, NV=${nv.name}`);

  const ctxOf = (u: typeof tp, confirmed = false) => ({
    user: {
      id: u.id,
      role: u.role,
      name: u.name,
      teamGroupCode: u.teamGroupCode,
      department: u.department,
      managedDepartments: u.managedDepartments,
    },
    confirmed,
  });

  console.log("\n[createTask]");
  const r1 = await executeTool(
    "createTask",
    { title: "Test (RBAC-TEST)", assigneeQuery: cv.name, deadline: new Date(Date.now() + 7 * 86400_000).toISOString() },
    ctxOf(nv)
  );
  check(
    "NHAN_VIEN gọi createTask → reject",
    !r1.success,
    r1.error
  );

  const r2 = await executeTool(
    "createTask",
    { title: "Test (RBAC-TEST)", assigneeQuery: cv.name, deadline: new Date(Date.now() + 7 * 86400_000).toISOString() },
    ctxOf(cv)
  );
  check(
    "CHUYEN_VIEN gọi createTask → reject",
    !r2.success,
    r2.error
  );

  console.log("\n[getUserWorkload]");
  const r3 = await executeTool("getUserWorkload", {}, ctxOf(nv));
  check(
    "NHAN_VIEN gọi getUserWorkload → reject",
    !r3.success,
    r3.error
  );
  const r4 = await executeTool("getUserWorkload", {}, ctxOf(cv));
  check(
    "CHUYEN_VIEN gọi getUserWorkload → reject",
    !r4.success,
    r4.error
  );

  // TRUONG_BO_PHAN getUserWorkload trả ra trong dept mình
  console.log("\n[TRUONG_BO_PHAN getUserWorkload scope]");
  const r5 = await executeTool("getUserWorkload", {}, ctxOf(tbp));
  if (r5.success) {
    const managed = getManagedDepartments(tbp);
    const allInDept = r5.output.users.every((u: any) =>
      managed.includes(u.department)
    );
    check(
      `TBP getUserWorkload chỉ trả cán bộ trong dept (${managed.join(", ")})`,
      allInDept,
      `total=${r5.output.users.length}`
    );
  } else {
    check("TBP getUserWorkload thành công", false, r5.error);
  }

  // ========================================================
  // SECTION 3: TRUONG_BO_PHAN giao cho người ngoài dept → reject
  // ========================================================
  section("SECTION 3: TRUONG_BO_PHAN SCOPE GUARD");

  // Tìm 1 user ngoài dept của TBP
  const tbpManaged = getManagedDepartments(tbp);
  const outsideUser = users.find(
    (u) => !tbpManaged.includes(u.department) && u.role === "CHUYEN_VIEN"
  );
  if (outsideUser) {
    console.log(
      `TBP dept=${tbp.department} (managed=${tbpManaged.join(", ")}), ngoài dept: ${outsideUser.name} (${outsideUser.department})`
    );
    const r6 = await executeTool(
      "createTask",
      {
        title: "Test ngoài dept (RBAC-TEST)",
        assigneeQuery: outsideUser.name,
        deadline: new Date(Date.now() + 7 * 86400_000).toISOString(),
      },
      ctxOf(tbp, true)
    );
    check(
      "TBP giao task cho người NGOÀI dept → reject",
      !r6.success,
      r6.error
    );

    // Giao trong dept → OK
    const insideUser = users.find(
      (u) =>
        tbpManaged.includes(u.department) &&
        u.role === "CHUYEN_VIEN" &&
        u.id !== tbp.id
    );
    if (insideUser) {
      const r7 = await executeTool(
        "createTask",
        {
          title: "Test trong dept (RBAC-TEST)",
          assigneeQuery: insideUser.name,
          deadline: new Date(Date.now() + 7 * 86400_000).toISOString(),
        },
        ctxOf(tbp, true)
      );
      check(
        `TBP giao task cho người TRONG dept (${insideUser.name}) → OK`,
        r7.success,
        r7.error || `taskId=${r7.output?.taskId}`
      );
    }
  } else {
    console.log("⚠ Không có user ngoài dept của TBP để test");
  }

  // ========================================================
  // SECTION 4: Task scope filter (server action)
  // ========================================================
  section("SECTION 4: TASK SCOPE qua getTaskStats");

  const sTP = await executeTool("getTaskStats", { scope: "all" }, ctxOf(tp));
  check("TP getTaskStats({scope:all}) OK", sTP.success);

  const sTBP = await executeTool("getTaskStats", { scope: "all" }, ctxOf(tbp));
  check(
    "TBP getTaskStats({scope:all}) → reject",
    !sTBP.success,
    sTBP.error
  );

  const sTBPdept = await executeTool("getTaskStats", {}, ctxOf(tbp));
  check(
    "TBP getTaskStats() default scope (=my-team) OK",
    sTBPdept.success,
    `total=${sTBPdept.output?.total}`
  );

  const sCV = await executeTool("getTaskStats", { scope: "all" }, ctxOf(cv));
  check(
    "CV getTaskStats({scope:all}) → reject",
    !sCV.success
  );
  const sCVmine = await executeTool("getTaskStats", {}, ctxOf(cv));
  check(
    "CV getTaskStats() default (=mine) OK",
    sCVmine.success,
    `total=${sCVmine.output?.total}`
  );

  // ========================================================
  // Cleanup
  // ========================================================
  section("CLEANUP");
  const d = await db.task.deleteMany({
    where: { title: { contains: "(RBAC-TEST)" } },
  });
  console.log(`Deleted ${d.count} test tasks`);

  section("RESULT");
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
