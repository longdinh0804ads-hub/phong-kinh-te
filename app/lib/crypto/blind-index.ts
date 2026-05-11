/**
 * Blind index cho phép search trên field đã encrypt.
 *
 * Exact match (email, phone):
 *   blind_index = HMAC-SHA256(BLIND_KEY, normalize(value))
 *   → lưu cột email_bidx có @unique index
 *   → query: where: { email_bidx: bidx(input) }
 *
 * Partial match (tên người, địa chỉ - cần LIKE):
 *   tokens = trigrams (3-gram) của normalized value
 *   bidx[] = tokens.map(t => HMAC(BLIND_KEY, "tri:" + t))
 *   → lưu cột nameBidx String[]
 *   → query: where: { nameBidx: { hasSome: trigramBidx(input) } }
 *
 * BLIND_KEY tách riêng khỏi DATA_ENCRYPTION_KEY (env BLIND_INDEX_KEY).
 * Không tách thì xoay 1 key sẽ phá cả ciphertext lẫn index.
 */
import crypto from "crypto";

let cachedBlindKey: Buffer | null = null;
function getBlindKey(): Buffer {
  if (cachedBlindKey) return cachedBlindKey;

  const fromEnv = process.env.BLIND_INDEX_KEY;
  if (fromEnv) {
    if (fromEnv.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(fromEnv)) {
      throw new Error(
        "BLIND_INDEX_KEY phải là 64 ký tự hex (32 bytes). " +
          "Sinh bằng: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
      );
    }
    cachedBlindKey = Buffer.from(fromEnv, "hex");
    return cachedBlindKey;
  }

  // Fallback DEV: derive từ BETTER_AUTH_SECRET với prefix khác DATA_ENC
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BLIND_INDEX_KEY hoặc BETTER_AUTH_SECRET phải set");
  console.warn("[blind-index] BLIND_INDEX_KEY chưa set, derive từ BETTER_AUTH_SECRET (DEV only).");
  cachedBlindKey = crypto.createHash("sha256").update("blind:v1:" + secret).digest();
  return cachedBlindKey;
}

/**
 * Normalize value trước khi index:
 *  - Trim + lowercase
 *  - Remove dấu tiếng Việt
 *  - Remove ký tự đặc biệt (chỉ giữ a-z0-9 + space)
 */
export function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // dấu
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .trim();
}

/**
 * Exact-match blind index.
 * @param table+field để derive sub-key (tránh cross-table collision).
 */
export function exactBidx(value: string | null | undefined, table: string, field: string): string | null {
  if (!value) return null;
  const normalized = normalize(value);
  if (!normalized) return null;
  const key = deriveBidxKey(table, field);
  return crypto.createHmac("sha256", key).update(normalized).digest("hex");
}

/**
 * Trigram blind index (mảng).
 * Phù hợp cho field cần search by partial (vd "Nguyễn V" → tìm tên).
 *
 * VD "nguyen van a":
 *  Trigrams: "ngu", "guy", "uye", "yen", "en ", "n v", " va", "van", "an ", "n a"
 *  Output: [HMAC(...), HMAC(...), ...]
 *
 * Query: `where: { nameBidx: { hasSome: trigramBidx("nguyen", table, field) } }`
 */
export function trigramBidx(
  value: string | null | undefined,
  table: string,
  field: string
): string[] {
  if (!value) return [];
  const normalized = normalize(value);
  if (normalized.length < 3) {
    // Quá ngắn để trigram - dùng full string làm 1 token
    if (normalized.length === 0) return [];
    return [hmacToken(normalized, table, field)];
  }
  const tokens = new Set<string>();
  for (let i = 0; i <= normalized.length - 3; i++) {
    const tri = normalized.slice(i, i + 3);
    if (tri.trim()) tokens.add(tri); // bỏ qua nếu toàn space
  }
  return Array.from(tokens).map((t) => hmacToken(t, table, field));
}

function hmacToken(token: string, table: string, field: string): string {
  const key = deriveBidxKey(table, field);
  return crypto.createHmac("sha256", key).update("tri:" + token).digest("hex").slice(0, 24);
  // Slice 24 hex = 96 bit - đủ chống collision cho domain 21 user × hàng ngàn record
}

/**
 * Derive per-field sub-key (HKDF từ BLIND_KEY + table.field).
 * Tách sub-key giữa các field để tránh leak khi 1 field bị attack.
 */
const subKeyCache = new Map<string, Buffer>();
function deriveBidxKey(table: string, field: string): Buffer {
  const cacheKey = `${table}.${field}`;
  const cached = subKeyCache.get(cacheKey);
  if (cached) return cached;
  const info = Buffer.from("bidx:" + cacheKey);
  const salt = Buffer.from("loha-bidx-v1");
  const sub = Buffer.from(crypto.hkdfSync("sha256", getBlindKey(), salt, info, 32));
  subKeyCache.set(cacheKey, sub);
  return sub;
}

export function clearBidxCache(): void {
  subKeyCache.clear();
  cachedBlindKey = null;
}
