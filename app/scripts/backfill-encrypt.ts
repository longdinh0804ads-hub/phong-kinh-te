/**
 * Backfill script: encrypt dữ liệu hiện có trong DB.
 *
 * - Idempotent: skip record đã encrypt (có prefix "enc:")
 * - Batched: 50 record/batch để tránh long transaction
 * - Dry-run mode: pass --dry để xem sẽ encrypt bao nhiêu record (không update)
 * - Backup: gợi ý dump DB trước khi chạy
 *
 * Usage:
 *   # Dry run (KHÔNG sửa DB)
 *   npx tsx scripts/backfill-encrypt.ts --dry
 *
 *   # Thực thi (có sửa DB)
 *   npx tsx scripts/backfill-encrypt.ts
 *
 * Yêu cầu: env DATA_ENCRYPTION_KEY + BLIND_INDEX_KEY đã set.
 */
import * as fs from "fs";
import * as path from "path";
// Load cả .env và .env.local (local override)
for (const envName of [".env", ".env.local"]) {
  const envFile = path.join(__dirname, "..", envName);
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
}

import { PrismaClient } from "@prisma/client";
import { encrypt, isEncrypted } from "../lib/crypto/envelope";
import { exactBidx, trigramBidx } from "../lib/crypto/blind-index";

const DRY = process.argv.includes("--dry");
const BATCH = 50;
const rawDb = new PrismaClient(); // không có extension - thao tác trực tiếp

interface Stats {
  total: number;
  encrypted: number;
  skipped: number;
}

async function backfillIHanoi(): Promise<Stats> {
  console.log("\n📦 Backfill iHanoiComplaint...");
  const stats: Stats = { total: 0, encrypted: 0, skipped: 0 };
  let cursor: string | undefined;
  while (true) {
    const batch = await rawDb.iHanoiComplaint.findMany({
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;

    for (const r of batch) {
      stats.total++;
      const fieldsToEnc = ["content", "citizenName", "citizenPhone", "citizenAddress", "resolution"];
      const updates: any = {};
      let changed = false;

      for (const f of fieldsToEnc) {
        const v = (r as any)[f];
        if (typeof v === "string" && v && !isEncrypted(v)) {
          updates[f] = encrypt(v, "iHanoiComplaint", f);
          changed = true;
        }
      }
      // Update blind index nếu có
      if (r.citizenName && !isEncrypted(r.citizenName)) {
        updates.citizenNameBidx = trigramBidx(r.citizenName, "iHanoiComplaint", "citizenName");
      }
      if (r.citizenPhone && !isEncrypted(r.citizenPhone)) {
        updates.citizenPhoneBidx = exactBidx(r.citizenPhone, "iHanoiComplaint", "citizenPhone");
      }

      if (changed) {
        if (!DRY) {
          await rawDb.iHanoiComplaint.update({ where: { id: r.id }, data: updates });
        }
        stats.encrypted++;
      } else {
        stats.skipped++;
      }
    }
  }
  console.log(`   Total: ${stats.total} | Encrypted: ${stats.encrypted} | Skipped: ${stats.skipped}`);
  return stats;
}

async function backfillTTHC(): Promise<Stats> {
  console.log("\n📦 Backfill TTHCRecord...");
  const stats: Stats = { total: 0, encrypted: 0, skipped: 0 };
  let cursor: string | undefined;
  while (true) {
    const batch = await rawDb.tTHCRecord.findMany({
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;

    for (const r of batch) {
      stats.total++;
      const updates: any = {};
      let changed = false;
      const fieldsToEnc = ["applicantName", "applicantPhone", "notes"];
      for (const f of fieldsToEnc) {
        const v = (r as any)[f];
        if (typeof v === "string" && v && !isEncrypted(v)) {
          updates[f] = encrypt(v, "tTHCRecord", f);
          changed = true;
        }
      }
      if (r.applicantName && !isEncrypted(r.applicantName)) {
        updates.applicantNameBidx = trigramBidx(r.applicantName, "tTHCRecord", "applicantName");
      }
      if (r.applicantPhone && !isEncrypted(r.applicantPhone)) {
        updates.applicantPhoneBidx = exactBidx(r.applicantPhone, "tTHCRecord", "applicantPhone");
      }

      if (changed) {
        if (!DRY) await rawDb.tTHCRecord.update({ where: { id: r.id }, data: updates });
        stats.encrypted++;
      } else stats.skipped++;
    }
  }
  console.log(`   Total: ${stats.total} | Encrypted: ${stats.encrypted} | Skipped: ${stats.skipped}`);
  return stats;
}

async function backfillTaskNotes(): Promise<Stats> {
  console.log("\n📦 Backfill TaskNote...");
  const stats: Stats = { total: 0, encrypted: 0, skipped: 0 };
  let cursor: string | undefined;
  while (true) {
    const batch = await rawDb.taskNote.findMany({
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;
    for (const r of batch) {
      stats.total++;
      if (r.content && !isEncrypted(r.content)) {
        if (!DRY) {
          await rawDb.taskNote.update({
            where: { id: r.id },
            data: { content: encrypt(r.content, "taskNote", "content") },
          });
        }
        stats.encrypted++;
      } else stats.skipped++;
    }
  }
  console.log(`   Total: ${stats.total} | Encrypted: ${stats.encrypted} | Skipped: ${stats.skipped}`);
  return stats;
}

async function backfillTasks(): Promise<Stats> {
  console.log("\n📦 Backfill Task.description...");
  const stats: Stats = { total: 0, encrypted: 0, skipped: 0 };
  let cursor: string | undefined;
  while (true) {
    const batch = await rawDb.task.findMany({
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;
    for (const r of batch) {
      stats.total++;
      if (r.description && !isEncrypted(r.description)) {
        if (!DRY) {
          await rawDb.task.update({
            where: { id: r.id },
            data: { description: encrypt(r.description, "task", "description") },
          });
        }
        stats.encrypted++;
      } else stats.skipped++;
    }
  }
  console.log(`   Total: ${stats.total} | Encrypted: ${stats.encrypted} | Skipped: ${stats.skipped}`);
  return stats;
}

async function backfillProgressReports(): Promise<Stats> {
  console.log("\n📦 Backfill ProgressReport...");
  const stats: Stats = { total: 0, encrypted: 0, skipped: 0 };
  let cursor: string | undefined;
  while (true) {
    const batch = await rawDb.progressReport.findMany({
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;
    for (const r of batch) {
      stats.total++;
      const updates: any = {};
      let changed = false;
      if (r.notes && !isEncrypted(r.notes)) {
        updates.notes = encrypt(r.notes, "progressReport", "notes");
        changed = true;
      }
      if (r.blockers && !isEncrypted(r.blockers)) {
        updates.blockers = encrypt(r.blockers, "progressReport", "blockers");
        changed = true;
      }
      if (changed) {
        if (!DRY) await rawDb.progressReport.update({ where: { id: r.id }, data: updates });
        stats.encrypted++;
      } else stats.skipped++;
    }
  }
  console.log(`   Total: ${stats.total} | Encrypted: ${stats.encrypted} | Skipped: ${stats.skipped}`);
  return stats;
}

async function backfillUbnd(): Promise<Stats> {
  console.log("\n📦 Backfill UBNDDirective...");
  const stats: Stats = { total: 0, encrypted: 0, skipped: 0 };
  let cursor: string | undefined;
  while (true) {
    const batch = await rawDb.uBNDDirective.findMany({
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;
    for (const r of batch) {
      stats.total++;
      const updates: any = {};
      let changed = false;
      if (r.content && !isEncrypted(r.content)) {
        updates.content = encrypt(r.content, "uBNDDirective", "content");
        changed = true;
      }
      if (r.phongResponse && !isEncrypted(r.phongResponse)) {
        updates.phongResponse = encrypt(r.phongResponse, "uBNDDirective", "phongResponse");
        changed = true;
      }
      if (changed) {
        if (!DRY) await rawDb.uBNDDirective.update({ where: { id: r.id }, data: updates });
        stats.encrypted++;
      } else stats.skipped++;
    }
  }
  console.log(`   Total: ${stats.total} | Encrypted: ${stats.encrypted} | Skipped: ${stats.skipped}`);
  return stats;
}

async function backfillChatHistory(): Promise<Stats> {
  console.log("\n📦 Backfill ChatHistory...");
  const stats: Stats = { total: 0, encrypted: 0, skipped: 0 };
  let cursor: string | undefined;
  while (true) {
    const batch = await rawDb.chatHistory.findMany({
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;
    for (const r of batch) {
      stats.total++;
      const updates: any = {};
      let changed = false;
      if (r.question && !isEncrypted(r.question)) {
        updates.question = encrypt(r.question, "chatHistory", "question");
        changed = true;
      }
      if (r.answer && !isEncrypted(r.answer)) {
        updates.answer = encrypt(r.answer, "chatHistory", "answer");
        changed = true;
      }
      if (changed) {
        if (!DRY) await rawDb.chatHistory.update({ where: { id: r.id }, data: updates });
        stats.encrypted++;
      } else stats.skipped++;
    }
  }
  console.log(`   Total: ${stats.total} | Encrypted: ${stats.encrypted} | Skipped: ${stats.skipped}`);
  return stats;
}

async function backfillNotifications(): Promise<Stats> {
  console.log("\n📦 Backfill Notification.message...");
  const stats: Stats = { total: 0, encrypted: 0, skipped: 0 };
  let cursor: string | undefined;
  while (true) {
    const batch = await rawDb.notification.findMany({
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;
    for (const r of batch) {
      stats.total++;
      if (r.message && !isEncrypted(r.message)) {
        if (!DRY) {
          await rawDb.notification.update({
            where: { id: r.id },
            data: { message: encrypt(r.message, "notification", "message") },
          });
        }
        stats.encrypted++;
      } else stats.skipped++;
    }
  }
  console.log(`   Total: ${stats.total} | Encrypted: ${stats.encrypted} | Skipped: ${stats.skipped}`);
  return stats;
}

async function backfillUserPhone(): Promise<Stats> {
  console.log("\n📦 Backfill User.phone + responsibilities...");
  const stats: Stats = { total: 0, encrypted: 0, skipped: 0 };
  let cursor: string | undefined;
  while (true) {
    const batch = await rawDb.user.findMany({
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;
    for (const r of batch) {
      stats.total++;
      const updates: any = {};
      let changed = false;
      if (r.phone && !isEncrypted(r.phone)) {
        updates.phone = encrypt(r.phone, "user", "phone");
        updates.phoneBidx = exactBidx(r.phone, "user", "phone");
        changed = true;
      }
      if (r.responsibilities && !isEncrypted(r.responsibilities)) {
        updates.responsibilities = encrypt(r.responsibilities, "user", "responsibilities");
        changed = true;
      }
      if (changed) {
        if (!DRY) await rawDb.user.update({ where: { id: r.id }, data: updates });
        stats.encrypted++;
      } else stats.skipped++;
    }
  }
  console.log(`   Total: ${stats.total} | Encrypted: ${stats.encrypted} | Skipped: ${stats.skipped}`);
  return stats;
}

async function main() {
  console.log("╔════════════════════════════════════════════════════════╗");
  console.log("║  BACKFILL FIELD ENCRYPTION                            ║");
  console.log(`║  Mode: ${DRY ? "DRY RUN (không sửa DB)" : "EXECUTE (sửa DB thật)"}                       ║`);
  console.log("╚════════════════════════════════════════════════════════╝");
  if (!DRY) {
    console.log(
      "\n⚠ Khuyến nghị: pg_dump DB trước khi chạy. Tiếp tục sau 3 giây hoặc Ctrl+C để hủy..."
    );
    await new Promise((r) => setTimeout(r, 3000));
  }

  const all: Array<{ name: string; stats: Stats }> = [];
  all.push({ name: "iHanoi", stats: await backfillIHanoi() });
  all.push({ name: "TTHC", stats: await backfillTTHC() });
  all.push({ name: "TaskNote", stats: await backfillTaskNotes() });
  all.push({ name: "Task", stats: await backfillTasks() });
  all.push({ name: "ProgressReport", stats: await backfillProgressReports() });
  all.push({ name: "UBND", stats: await backfillUbnd() });
  all.push({ name: "ChatHistory", stats: await backfillChatHistory() });
  all.push({ name: "Notification", stats: await backfillNotifications() });
  all.push({ name: "User.phone", stats: await backfillUserPhone() });

  console.log("\n═══════════════════════════════════════════════");
  console.log("TỔNG KẾT:");
  console.log("═══════════════════════════════════════════════");
  for (const { name, stats } of all) {
    console.log(
      `  ${name.padEnd(15)} ${String(stats.total).padStart(5)} total, ${String(stats.encrypted).padStart(5)} encrypted, ${String(stats.skipped).padStart(5)} skipped`
    );
  }
  if (DRY) {
    console.log("\n⚠ DRY RUN - DB chưa được sửa. Chạy lại không --dry để áp dụng.");
  }
  await rawDb.$disconnect();
}

main().catch(async (e) => {
  console.error("✗ FAIL:", e);
  await rawDb.$disconnect();
  process.exit(1);
});
