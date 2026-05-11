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

async function main() {
  const users = await db.user.findMany({
    where: { isActive: true },
    orderBy: [{ role: "asc" }, { teamGroupCode: "asc" }, { name: "asc" }],
    select: { email: true, name: true, role: true, position: true, teamGroupCode: true },
  });
  const ROLE: Record<string, string> = {
    TRUONG_PHONG: "Trưởng phòng",
    PHO_TP: "Phó TP",
    TRUONG_BO_PHAN: "Tổ trưởng",
    CHUYEN_VIEN: "Chuyên viên",
    NHAN_VIEN: "Nhân viên",
  };
  console.log(`STT | Họ tên | Email | Vai trò | Tổ | Chức vụ`);
  console.log(`----+--------+-------+---------+----+--------`);
  let i = 1;
  for (const u of users) {
    const tg = u.teamGroupCode === "to-1" ? "Tổ 1" : u.teamGroupCode === "to-2" ? "Tổ 2" : "-";
    console.log(
      `${String(i++).padStart(2)} | ${u.name.padEnd(22)} | ${u.email.padEnd(40)} | ${ROLE[u.role].padEnd(13)} | ${tg.padEnd(5)} | ${u.position}`
    );
  }
  console.log(`\nTotal: ${users.length} users`);
  process.exit(0);
}
main();
