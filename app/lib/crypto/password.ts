/**
 * Password hashing + verify với:
 *  - Argon2id (OWASP 2024 recommended: m=19MiB, t=2, p=1)
 *  - Pre-hash pepper HMAC-SHA256 (server-side secret, DB leak không đủ)
 *  - Migration mềm: verify được cả bcrypt cũ (cost 10/12), tự rehash sang argon2id
 *
 * Format hash trong DB:
 *   $argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>   (mới)
 *   $2a$12$...                                     (bcrypt cũ - sẽ migrate khi user login)
 */
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import bcrypt from "bcryptjs";
import crypto from "crypto";

// Algorithm enum: 0=Argon2d, 1=Argon2i, 2=Argon2id (theo @node-rs/argon2)
const ARGON_OPTIONS = {
  memoryCost: 19_456, // 19 MiB - OWASP 2024
  timeCost: 2,
  parallelism: 1,
  algorithm: 2 as const, // Argon2id
} as const;

function getPepper(): Buffer {
  const pepper = process.env.PASSWORD_PEPPER;
  if (!pepper || pepper.length < 32) {
    // Fallback: derive từ BETTER_AUTH_SECRET (vẫn an toàn nếu pepper riêng chưa set,
    // nhưng cảnh báo trong production qua lib/security-config.ts)
    const secret = process.env.BETTER_AUTH_SECRET;
    if (!secret) throw new Error("PASSWORD_PEPPER hoặc BETTER_AUTH_SECRET phải được set");
    return crypto.createHash("sha256").update("pepper:" + secret).digest();
  }
  // Hex hoặc plain string đều OK
  return Buffer.from(pepper, pepper.length === 64 ? "hex" : "utf8");
}

/**
 * Pre-hash password với pepper bằng HMAC-SHA256, encode hex string.
 * (Phải dùng hex chứ không phải Buffer raw vì @node-rs/argon2.verify yêu cầu UTF-8 string).
 */
function applyPepper(plaintext: string): string {
  return crypto.createHmac("sha256", getPepper()).update(plaintext, "utf8").digest("hex");
}

/**
 * Hash password bằng Argon2id + pepper.
 * Trả string `$argon2id$...` để verify sau.
 */
export async function hashPassword(plaintext: string): Promise<string> {
  if (!plaintext || plaintext.length < 1) throw new Error("Empty password");
  const peppered = applyPepper(plaintext);
  return argonHash(peppered, ARGON_OPTIONS);
}

/**
 * Verify password.
 * - Nếu hash là argon2id → verify trực tiếp
 * - Nếu hash là bcrypt ($2a/$2b/$2y) → verify bcrypt (không pepper - bcrypt cũ chưa có pepper)
 * - Trả về { valid, needsRehash } - needsRehash=true nghĩa là caller nên rehash + update DB
 */
export async function verifyPassword(
  plaintext: string,
  storedHash: string
): Promise<{ valid: boolean; needsRehash: boolean }> {
  if (!plaintext || !storedHash) return { valid: false, needsRehash: false };

  // Argon2id (current)
  if (storedHash.startsWith("$argon2")) {
    try {
      const peppered = applyPepper(plaintext);
      const valid = await argonVerify(storedHash, peppered);
      // Nếu params trong hash thấp hơn ARGON_OPTIONS hiện tại → rehash
      const needsRehash = valid && shouldRehashArgon(storedHash);
      return { valid, needsRehash };
    } catch {
      return { valid: false, needsRehash: false };
    }
  }

  // Bcrypt legacy ($2a / $2b / $2y)
  if (storedHash.startsWith("$2")) {
    try {
      const valid = await bcrypt.compare(plaintext, storedHash);
      return { valid, needsRehash: valid }; // verify OK → rehash sang argon2id + pepper
    } catch {
      return { valid: false, needsRehash: false };
    }
  }

  return { valid: false, needsRehash: false };
}

/**
 * Check xem argon2 hash cũ có cần rehash không (params thay đổi).
 * Hash format: $argon2id$v=19$m=19456,t=2,p=1$...
 */
function shouldRehashArgon(hash: string): boolean {
  const match = hash.match(/\$m=(\d+),t=(\d+),p=(\d+)\$/);
  if (!match) return true;
  const [, m, t, p] = match;
  return (
    parseInt(m) < ARGON_OPTIONS.memoryCost ||
    parseInt(t) < ARGON_OPTIONS.timeCost ||
    parseInt(p) < ARGON_OPTIONS.parallelism
  );
}

/** Sinh password tạm 16 ký tự an toàn (cho admin reset). */
export function generateTempPassword(length = 16): string {
  // Chỉ dùng ký tự không gây nhầm lẫn (loại bỏ O/0, I/l/1)
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const symbols = "!@#$%^&*";
  let pw = "";
  // Đảm bảo có ít nhất 1 chữ thường, 1 chữ hoa, 1 số, 1 ký tự đặc biệt
  pw += "ABCDEFGHJKLMNPQRSTUVWXYZ"[crypto.randomInt(0, 24)];
  pw += "abcdefghijkmnpqrstuvwxyz"[crypto.randomInt(0, 24)];
  pw += "23456789"[crypto.randomInt(0, 8)];
  pw += symbols[crypto.randomInt(0, symbols.length)];
  for (let i = pw.length; i < length; i++) {
    pw += charset[crypto.randomInt(0, charset.length)];
  }
  // Shuffle
  return pw.split("").sort(() => crypto.randomInt(0, 2) - 1).join("");
}
