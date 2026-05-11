/**
 * Sinh các key mã hóa cần thiết cho production:
 *   - DATA_ENCRYPTION_KEY:  envelope encryption cho field PII
 *   - BLIND_INDEX_KEY:      blind index search
 *   - PASSWORD_PEPPER:      pre-hash pepper cho password
 *   - BETTER_AUTH_SECRET:   session signing
 *   - CRON_SECRET:          cron endpoint auth
 *
 * Chạy 1 LẦN khi setup production:
 *   npx tsx scripts/generate-encryption-keys.ts
 *
 * Copy output vào:
 *   - /etc/loha/keys/master.key   (file 0400, owner app user)
 *   - hoặc .env (DEV only)
 *
 * IMPORTANT:
 *   - Lưu key ở 2 nơi: server + két sắt giấy in (paper key)
 *   - KHÔNG commit vào git
 *   - Mất key = mất toàn bộ data đã encrypt
 *   - Rotate key 12 tháng/lần (xem docs/security-key-rotation.md)
 */
import crypto from "crypto";

function genKey(name: string, lengthBytes: number = 32): string {
  return crypto.randomBytes(lengthBytes).toString("hex");
}

console.log("# ════════════════════════════════════════════════");
console.log("# LOHA / PKT Trần Phú - Encryption Keys");
console.log("# Sinh lúc:", new Date().toISOString());
console.log("# ════════════════════════════════════════════════");
console.log("#");
console.log("# CẢNH BÁO QUAN TRỌNG:");
console.log("#  - Lưu các key này ở NƠI AN TOÀN");
console.log("#  - In ra giấy cất két (paper key) + copy USB encrypted");
console.log("#  - KHÔNG commit vào git");
console.log("#  - MẤT KEY = MẤT TOÀN BỘ DỮ LIỆU đã encrypt");
console.log("#");
console.log("");
console.log("# Master encryption key cho field PII (citizen data, task notes...)");
console.log(`DATA_ENCRYPTION_KEY="${genKey("DATA_ENCRYPTION_KEY")}"`);
console.log("");
console.log("# Blind index key (cho phép search trên field encrypted)");
console.log(`BLIND_INDEX_KEY="${genKey("BLIND_INDEX_KEY")}"`);
console.log("");
console.log("# Password pre-hash pepper (chống offline brute-force khi DB leak)");
console.log(`PASSWORD_PEPPER="${genKey("PASSWORD_PEPPER")}"`);
console.log("");
console.log("# Better Auth secret cho session signing");
console.log(`BETTER_AUTH_SECRET="${genKey("BETTER_AUTH_SECRET", 48)}"`);
console.log("");
console.log("# Cron endpoint authentication");
console.log(`CRON_SECRET="${genKey("CRON_SECRET")}"`);
console.log("");
console.log("# ════════════════════════════════════════════════");
console.log("# Lưu file backup giấy:");
console.log("#  1. In trang này ra, kẹp vào folder bảo mật");
console.log("#  2. Cất 1 bản ở phòng TP, 1 bản ở phòng PTP");
console.log("#  3. Hủy file digital sau khi đã setup");
console.log("# ════════════════════════════════════════════════");
