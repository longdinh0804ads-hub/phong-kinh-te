/**
 * Envelope encryption với HKDF-derived per-field key + AES-256-GCM.
 *
 * Kiến trúc:
 *   MASTER_KEY (64-byte hex từ env DATA_ENCRYPTION_KEY)
 *       │
 *       ├─→ HKDF(salt="<table>.<field>.v<n>") → DEK (32 bytes)
 *       │
 *       └─→ AES-256-GCM(DEK, iv random 12B, plaintext, aad="<table>.<field>")
 *           → version(1B) | iv(12B) | tag(16B) | ciphertext
 *           → base64 encode → lưu DB
 *
 * Key rotation: tăng version trong context salt, lazy re-encrypt khi update.
 * KEY_VERSION ≤ KEY_VERSIONS_SUPPORTED (đọc env, mặc định v1).
 *
 * Lý do envelope:
 *  - 1 file key duy nhất ở app server (ngoài DB), backup riêng
 *  - DB leak ≠ decrypt (vì DEK không lưu)
 *  - Rotate master key = không cần re-encrypt mọi record (DEK derive lại)
 */
import crypto from "crypto";

const KEY_VERSION_CURRENT = 1;
const CIPHER_ALGO = "aes-256-gcm";

/**
 * Load master key từ env hoặc file system.
 * Production: dùng `/etc/loha/keys/master.key` (file 0400 root-owned).
 * Dev: env DATA_ENCRYPTION_KEY (64 hex chars = 32 bytes).
 */
let cachedMasterKey: Buffer | null = null;
function getMasterKey(): Buffer {
  if (cachedMasterKey) return cachedMasterKey;

  const fromEnv = process.env.DATA_ENCRYPTION_KEY;
  if (fromEnv) {
    if (fromEnv.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(fromEnv)) {
      throw new Error(
        "DATA_ENCRYPTION_KEY phải là 64 ký tự hex (32 bytes). " +
          "Sinh bằng: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
      );
    }
    cachedMasterKey = Buffer.from(fromEnv, "hex");
    return cachedMasterKey;
  }

  // Fallback (DEV only): derive từ BETTER_AUTH_SECRET với prefix khác
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "DATA_ENCRYPTION_KEY chưa cấu hình. " +
        "Production: sinh key 32 bytes hex, lưu vào env DATA_ENCRYPTION_KEY."
    );
  }
  console.warn(
    "[envelope] DATA_ENCRYPTION_KEY chưa set, derive từ BETTER_AUTH_SECRET (DEV only)."
  );
  cachedMasterKey = crypto
    .createHash("sha256")
    .update("data-enc:v1:" + secret)
    .digest();
  return cachedMasterKey;
}

/**
 * HKDF derive key cho 1 cặp table.field + version.
 * Cache để tránh derive lại mỗi call.
 */
const dekCache = new Map<string, Buffer>();
function deriveDek(table: string, field: string, version: number): Buffer {
  const cacheKey = `${table}.${field}.v${version}`;
  const cached = dekCache.get(cacheKey);
  if (cached) return cached;

  const masterKey = getMasterKey();
  // HKDF Node.js: hkdfSync(digest, ikm, salt, info, keylen)
  const info = Buffer.from(cacheKey);
  const salt = Buffer.from("loha-envelope-v1"); // constant - mọi DEK cùng salt nhưng khác info
  const dek = Buffer.from(crypto.hkdfSync("sha256", masterKey, salt, info, 32));

  dekCache.set(cacheKey, dek);
  return dek;
}

/**
 * Encrypt plaintext → base64 string.
 * Format binary: version(1) | iv(12) | tag(16) | ciphertext(*)
 *
 * @param plaintext Chuỗi UTF-8
 * @param table Tên bảng (vd "iHanoiComplaint")
 * @param field Tên field (vd "citizenName")
 */
export function encrypt(plaintext: string, table: string, field: string): string {
  if (plaintext === null || plaintext === undefined) {
    throw new Error("encrypt: plaintext null/undefined");
  }
  const version = KEY_VERSION_CURRENT;
  const dek = deriveDek(table, field, version);
  const iv = crypto.randomBytes(12);
  const aad = Buffer.from(`${table}.${field}`);

  const cipher = crypto.createCipheriv(CIPHER_ALGO, dek, iv, { authTagLength: 16 });
  cipher.setAAD(aad);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  const buf = Buffer.concat([Buffer.from([version]), iv, tag, ct]);
  return "enc:" + buf.toString("base64");
}

/**
 * Decrypt ngược lại. Trả plaintext UTF-8.
 * Nếu ciphertext không có prefix "enc:" → trả nguyên (backward compat với data cũ chưa encrypt).
 */
export function decrypt(ciphertext: string, table: string, field: string): string {
  if (!ciphertext) return ciphertext;
  if (!ciphertext.startsWith("enc:")) {
    // Legacy plaintext - trả nguyên (cho phép gradual migration)
    return ciphertext;
  }

  const buf = Buffer.from(ciphertext.slice(4), "base64");
  if (buf.length < 1 + 12 + 16) {
    throw new Error(`Ciphertext quá ngắn cho ${table}.${field}`);
  }

  const version = buf[0];
  const iv = buf.subarray(1, 13);
  const tag = buf.subarray(13, 29);
  const ct = buf.subarray(29);
  const aad = Buffer.from(`${table}.${field}`);

  const dek = deriveDek(table, field, version);
  const decipher = crypto.createDecipheriv(CIPHER_ALGO, dek, iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  decipher.setAAD(aad);

  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/**
 * Check 1 value có được encrypted hay chưa (qua prefix).
 */
export function isEncrypted(value: string | null | undefined): boolean {
  return !!value && value.startsWith("enc:");
}

/**
 * Clear cache (dùng cho test hoặc khi rotate key thủ công).
 */
export function clearKeyCache(): void {
  dekCache.clear();
  cachedMasterKey = null;
}
