// Test getSidebarBadges với real DB data
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
import { getSidebarBadges } from "../lib/sidebar-badges";

async function main() {
  // Lấy 3 user khác role để test
  const users = await db.user.findMany({
    where: { isActive: true },
    take: 5,
    select: { id: true, name: true, role: true, teamGroupCode: true },
  });

  console.log(`Test getSidebarBadges với ${users.length} user:\n`);
  for (const u of users) {
    const t0 = Date.now();
    const badges = await getSidebarBadges({
      id: u.id,
      role: u.role,
      teamGroupCode: u.teamGroupCode,
    });
    const dt = Date.now() - t0;
    console.log(
      `  [${u.role}] ${u.name} (tổ: ${u.teamGroupCode || "—"}) — ${dt}ms`
    );
    console.log(
      `    Tasks: ${badges.tasks}${badges.tasksHasOverdue ? " ⚠ overdue" : ""}, ` +
        `UBND: ${badges.ubnd}, iHanoi: ${badges.ihanoi}, TTHC: ${badges.tthc}`
    );
  }

  console.log("\n✓ Helper hoạt động, không lỗi");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
