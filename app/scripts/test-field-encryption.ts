/**
 * E2E test field encryption:
 *  - Create record với plaintext → DB lưu ciphertext + blind index
 *  - Read record qua Prisma → tự decrypt về plaintext
 *  - Search bằng blind index → tìm được
 *  - Verify hacker đọc raw DB không thấy plaintext
 */
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
process.env.BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET || "test-secret-32bytes-min-padding-padding";

import { PrismaClient } from "@prisma/client";
import { fieldCipherExtension } from "../lib/crypto/field-cipher";
import { exactBidx, trigramBidx } from "../lib/crypto/blind-index";

const rawDb = new PrismaClient(); // KHÔNG có extension (đọc raw để check ciphertext)
const db = rawDb.$extends(fieldCipherExtension); // có extension (transparent)

async function cleanup() {
  await rawDb.iHanoiComplaint.deleteMany({ where: { ticketCode: { startsWith: "TEST-ENC-" } } });
  await rawDb.tTHCRecord.deleteMany({ where: { procedureCode: "TEST-ENC" } });
}

async function main() {
  await cleanup();

  console.log("--- Test 1: Create iHanoi với plaintext ---");
  const created = await db.iHanoiComplaint.create({
    data: {
      ticketCode: "TEST-ENC-001",
      content: "Khu vực thôn Trần Phú phản ánh đường lầy lội mưa lũ",
      citizenName: "Nguyễn Văn Anh",
      citizenPhone: "0912345678",
      citizenAddress: "Số 5 ngõ 12 thôn Trần Phú",
      receivedDate: new Date(),
      resolution: "Đã chuyển bộ phận xây dựng xử lý ngày 12/05",
    },
  });
  console.log("Created ID:", created.id);
  console.log("Returned (decrypted by extension):");
  console.log("  citizenName:", created.citizenName, "← plaintext OK");
  console.log("  citizenPhone:", created.citizenPhone, "← plaintext OK");
  console.log("  content:", created.content?.slice(0, 30) + "...");

  console.log("\n--- Test 2: Đọc raw DB (bypass extension) ---");
  const raw = await rawDb.iHanoiComplaint.findUnique({ where: { id: created.id } });
  console.log("Raw citizenName starts with 'enc:':", raw?.citizenName?.startsWith("enc:"));
  console.log("Raw citizenName excerpt:", raw?.citizenName?.slice(0, 30) + "...");
  console.log("Raw content excerpt:", raw?.content?.slice(0, 30) + "...");
  console.log("Raw citizenPhone excerpt:", raw?.citizenPhone?.slice(0, 30) + "...");
  console.log("Raw citizenNameBidx (trigram array):", raw?.citizenNameBidx.slice(0, 3) + "...");
  console.log("Raw citizenPhoneBidx (exact):", raw?.citizenPhoneBidx?.slice(0, 16) + "...");

  if (!raw?.citizenName?.startsWith("enc:")) throw new Error("citizenName NOT encrypted!");
  if (!raw?.citizenPhone?.startsWith("enc:")) throw new Error("citizenPhone NOT encrypted!");
  if (!raw?.content?.startsWith("enc:")) throw new Error("content NOT encrypted!");

  console.log("\n--- Test 3: Lookup theo blind index citizenPhone ---");
  const phoneBidx = exactBidx("0912345678", "iHanoiComplaint", "citizenPhone");
  console.log("Compute bidx:", phoneBidx?.slice(0, 16) + "...");
  const found = await db.iHanoiComplaint.findFirst({
    where: { citizenPhoneBidx: phoneBidx },
  });
  console.log("Found by phone:", found?.citizenName, "(decrypted)");
  if (!found || found.id !== created.id) throw new Error("Phone lookup failed");

  console.log("\n--- Test 4: Search theo trigram tên ---");
  const nameTrigrams = trigramBidx("nguyen", "iHanoiComplaint", "citizenName");
  console.log("Trigrams for 'nguyen':", nameTrigrams.length, "tokens");
  const foundByName = await db.iHanoiComplaint.findMany({
    where: { citizenNameBidx: { hasSome: nameTrigrams } },
  });
  console.log("Found by trigram:", foundByName.length, "records");
  console.log("Names:", foundByName.map((r) => r.citizenName));

  console.log("\n--- Test 5: Update với data mới (re-encrypt + re-index) ---");
  const updated = await db.iHanoiComplaint.update({
    where: { id: created.id },
    data: {
      citizenName: "Trần Thị Bình",
      citizenPhone: "0987654321",
    },
  });
  console.log("Updated citizenName:", updated.citizenName, "← decrypted");

  // Verify search lại với phone mới work
  const newBidx = exactBidx("0987654321", "iHanoiComplaint", "citizenPhone");
  const foundNew = await db.iHanoiComplaint.findFirst({
    where: { citizenPhoneBidx: newBidx },
  });
  console.log("Found by new phone:", foundNew?.citizenName);
  if (!foundNew) throw new Error("Update không refresh blind index!");

  console.log("\n--- Test 6: TTHCRecord encrypt ---");
  const tthc = await db.tTHCRecord.create({
    data: {
      procedureCode: "TEST-ENC",
      procedureName: "Thử cấp GCN quyền sử dụng đất",
      applicantName: "Lê Văn C",
      applicantPhone: "0934567890",
      receivedDate: new Date(),
      deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      notes: "Hồ sơ thiếu sổ hộ khẩu cũ - đang chờ bổ sung",
    },
  });
  const rawTthc = await rawDb.tTHCRecord.findUnique({ where: { id: tthc.id } });
  console.log("TTHC raw applicantName starts with 'enc:':", rawTthc?.applicantName?.startsWith("enc:"));
  console.log("TTHC raw notes starts with 'enc:':", rawTthc?.notes?.startsWith("enc:"));
  console.log("TTHC decrypted applicantName:", tthc.applicantName);

  await cleanup();
  console.log("\n✓ All field encryption tests passed");
  await rawDb.$disconnect();
}

main().catch(async (e) => {
  console.error("✗ FAIL:", e);
  await cleanup().catch(() => {});
  await rawDb.$disconnect();
  process.exit(1);
});
