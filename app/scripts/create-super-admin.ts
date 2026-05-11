// Script tạo SUPER_ADMIN user trên DB (local hoặc Supabase tùy DATABASE_URL).
// Chạy 1 lần để khởi tạo, sau đó dùng admin UI để quản lý.

import * as fs from "fs";
import * as path from "path";

const envFile = path.join(__dirname, "..", ".env");
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

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const ADMIN_EMAIL = "admin@phongkinhte-tranphu.vn";
const ADMIN_NAME = "Quản trị hệ thống";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "AdminPKT2026!";

async function main() {
  const db = new PrismaClient();

  // Check exists
  const existing = await db.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (existing) {
    console.log(`⚠ User ${ADMIN_EMAIL} đã tồn tại (role=${existing.role}).`);
    if (existing.role !== "SUPER_ADMIN") {
      await db.user.update({
        where: { id: existing.id },
        data: { role: "SUPER_ADMIN", isActive: true },
      });
      console.log("→ Đã update role thành SUPER_ADMIN.");
    }
    process.exit(0);
  }

  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const user = await db.user.create({
    data: {
      email: ADMIN_EMAIL,
      name: ADMIN_NAME,
      role: "SUPER_ADMIN",
      department: "BAN_LANH_DAO",
      position: "Quản trị hệ thống",
      fields: [],
      areas: [],
      managedDepartments: [],
      isTeamLeader: false,
      isActive: true,
      emailVerified: true,
      responsibilities:
        "Quản trị kỹ thuật: cập nhật API keys, quản lý tài khoản, theo dõi lỗi hệ thống, bảo trì.",
      accounts: {
        create: {
          providerId: "credential",
          accountId: ADMIN_EMAIL,
          password: hash,
        },
      },
    },
  });

  console.log("✓ Created SUPER_ADMIN:");
  console.log("  ID:        ", user.id);
  console.log("  Email:     ", ADMIN_EMAIL);
  console.log("  Password:  ", ADMIN_PASSWORD);
  console.log("  Role:      ", user.role);
  console.log("\nĐăng nhập tại: https://phong-kinh-te.vercel.app/login");
  console.log("Sau khi login → tự redirect /admin");

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
