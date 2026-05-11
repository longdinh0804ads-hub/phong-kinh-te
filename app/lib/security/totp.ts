/**
 * TOTP 2FA helper (otpauth lib + Google Authenticator compatible).
 *  - Generate secret 20 bytes random (160 bits)
 *  - Encode bằng AES-256-GCM (cùng key derive với system-settings) trước khi lưu DB
 *  - Verify TOTP code với window ±1 (cho phép drift 30s)
 *  - Sinh 8 backup codes random, hash SHA-256 lưu DB (verify so sánh hash)
 *
 * QR code: data URI PNG → render <img> trong UI.
 */
import * as OTPAuth from "otpauth";
import crypto from "crypto";
import QRCode from "qrcode";
import { encryptValue, decryptValue } from "@/lib/system-settings";

const ISSUER = "PKT Trần Phú";
const TOTP_ALGORITHM = "SHA1"; // chuẩn Google Authenticator
const TOTP_DIGITS = 6;
const TOTP_PERIOD = 30; // giây
const TOTP_WINDOW = 1; // chấp nhận code của period trước/sau

/**
 * Sinh secret mới (chưa lưu DB).
 * Trả về { secret, otpauthUrl, qrDataUrl }.
 */
export async function generateTotpSecret(email: string): Promise<{
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
}> {
  // 160-bit random secret (chuẩn TOTP)
  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret,
  });
  const otpauthUrl = totp.toString();
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
    width: 240,
    margin: 2,
    errorCorrectionLevel: "M",
  });
  return { secret: secret.base32, otpauthUrl, qrDataUrl };
}

/**
 * Verify TOTP code.
 * @param secretBase32 Secret base32 (đã decrypt từ DB)
 * @param code 6 chữ số user nhập
 */
export function verifyTotp(secretBase32: string, code: string): boolean {
  if (!secretBase32 || !code) return false;
  const cleaned = code.replace(/\s+/g, "").trim();
  if (!/^\d{6}$/.test(cleaned)) return false;
  try {
    const totp = new OTPAuth.TOTP({
      issuer: ISSUER,
      algorithm: TOTP_ALGORITHM,
      digits: TOTP_DIGITS,
      period: TOTP_PERIOD,
      secret: OTPAuth.Secret.fromBase32(secretBase32),
    });
    const delta = totp.validate({ token: cleaned, window: TOTP_WINDOW });
    return delta !== null; // null = invalid; số = thời điểm match
  } catch {
    return false;
  }
}

/**
 * Encrypt secret trước khi lưu DB.
 * Decrypt khi cần verify.
 */
export function encryptTotpSecret(plaintext: string): string {
  return encryptValue(plaintext);
}

export function decryptTotpSecret(ciphertext: string): string {
  return decryptValue(ciphertext);
}

/**
 * Sinh 8 backup codes (mỗi code 10 ký tự alphanumeric).
 * Trả về { plain, hashed } - plain hiển thị 1 lần cho user, hashed lưu DB.
 */
export function generateBackupCodes(count = 8): { plain: string[]; hashed: string[] } {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // loại bỏ O/0/I/1
  const plain: string[] = [];
  for (let i = 0; i < count; i++) {
    let code = "";
    for (let j = 0; j < 10; j++) code += charset[crypto.randomInt(0, charset.length)];
    // Format đẹp: ABCDE-FGHIJ
    plain.push(code.slice(0, 5) + "-" + code.slice(5));
  }
  const hashed = plain.map((c) => hashBackupCode(c));
  return { plain, hashed };
}

/** Hash backup code (deterministic, dùng SHA-256 với pepper từ env). */
export function hashBackupCode(code: string): string {
  const peppered = "backup:" + code.replace(/[-\s]/g, "").toUpperCase();
  return crypto
    .createHmac("sha256", process.env.BETTER_AUTH_SECRET || "fallback")
    .update(peppered)
    .digest("hex");
}

/**
 * Verify backup code: check input có hash khớp với 1 hash trong list không.
 * Trả về index của code khớp (để caller xóa khỏi list), hoặc -1.
 */
export function verifyBackupCode(input: string, hashedCodes: string[]): number {
  if (!input || !hashedCodes?.length) return -1;
  const h = hashBackupCode(input);
  return hashedCodes.findIndex((stored) => stored === h);
}
