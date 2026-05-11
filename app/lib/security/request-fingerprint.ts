/**
 * Helper trích xuất fingerprint từ request (IP subnet, UA hash, deviceId).
 * Dùng cho:
 *  - Session binding (so sánh khi resolve)
 *  - LoginAttempt log
 *  - SecurityEvent metadata
 */
import crypto from "crypto";

export interface RequestFingerprint {
  ipAddress: string;
  ipSubnet: string; // /24 cho IPv4, /64 cho IPv6
  userAgent: string;
  userAgentHash: string; // hash 16 ký tự của browser+OS (loại bỏ version chi tiết)
  deviceId?: string; // từ header X-Device-Id (do client gửi)
}

/**
 * Lấy IP thật từ headers (proxy-aware).
 * Ưu tiên: CF-Connecting-IP > X-Real-IP > X-Forwarded-For (first) > unknown
 */
export function getClientIp(headers: Headers): string {
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}

/**
 * Subnet /24 cho IPv4 (192.168.1.5 → 192.168.1.0/24).
 * Subnet /64 cho IPv6 (đầu 4 hextet).
 * IP private (lan/loopback) → trả nguyên.
 */
export function ipToSubnet(ip: string): string {
  if (!ip || ip === "unknown") return "unknown";

  if (ip.includes(":")) {
    const parts = ip.split(":");
    return parts.slice(0, 4).join(":") + "::/64";
  }

  const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.\d+$/);
  if (!m) return ip;
  return `${m[1]}.${m[2]}.${m[3]}.0/24`;
}

/**
 * Rút gọn User-Agent thành "browser+os" để so sánh.
 * Vd: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit... Chrome/130.0.0.0 Safari/537.36"
 *  → hash của "chrome|windows"
 * Mục tiêu: không bị mismatch khi browser auto-update version.
 */
export function hashUserAgent(ua: string | null | undefined): string {
  if (!ua) return crypto.createHash("sha256").update("unknown").digest("hex").slice(0, 16);

  const lower = ua.toLowerCase();
  let browser = "unknown";
  if (lower.includes("edg/")) browser = "edge";
  else if (lower.includes("chrome/")) browser = "chrome";
  else if (lower.includes("firefox/")) browser = "firefox";
  else if (lower.includes("safari/") && !lower.includes("chrome")) browser = "safari";
  else if (lower.includes("opr/") || lower.includes("opera")) browser = "opera";

  let os = "unknown";
  if (lower.includes("iphone") || lower.includes("ipad")) os = "ios";
  else if (lower.includes("android")) os = "android";
  else if (lower.includes("windows nt 10") || lower.includes("windows nt 11")) os = "windows";
  else if (lower.includes("mac os x") || lower.includes("macintosh")) os = "mac";
  else if (lower.includes("linux")) os = "linux";

  return crypto.createHash("sha256").update(`${browser}|${os}`).digest("hex").slice(0, 16);
}

/**
 * Đặt tên thiết bị friendly từ UA (vd "Chrome / Windows 11").
 */
export function describeDevice(ua: string | null | undefined): string {
  if (!ua) return "Thiết bị không xác định";
  const lower = ua.toLowerCase();

  let browser = "Trình duyệt khác";
  if (lower.includes("edg/")) browser = "Microsoft Edge";
  else if (lower.includes("chrome/") && !lower.includes("edg/")) browser = "Chrome";
  else if (lower.includes("firefox/")) browser = "Firefox";
  else if (lower.includes("safari/") && !lower.includes("chrome")) browser = "Safari";

  let os = "Hệ điều hành khác";
  // Mobile trước desktop: iPhone/iPad UA cũng chứa "Mac OS X"
  if (lower.includes("iphone")) os = "iPhone";
  else if (lower.includes("ipad")) os = "iPad";
  else if (lower.includes("android")) os = "Android";
  else if (lower.includes("windows nt 11") || lower.includes("windows nt 10")) os = "Windows";
  else if (lower.includes("mac os x") || lower.includes("macintosh")) os = "macOS";
  else if (lower.includes("linux")) os = "Linux";

  return `${browser} trên ${os}`;
}

/**
 * Trích xuất full fingerprint từ Headers (server action / API route).
 */
export function getFingerprint(headers: Headers): RequestFingerprint {
  const ipAddress = getClientIp(headers);
  const userAgent = headers.get("user-agent") || "";
  const deviceId = headers.get("x-device-id") || undefined;

  return {
    ipAddress,
    ipSubnet: ipToSubnet(ipAddress),
    userAgent,
    userAgentHash: hashUserAgent(userAgent),
    deviceId,
  };
}

/**
 * So sánh 2 fingerprint, trả về score mismatch.
 * 0 = match hoàn toàn; >=2 = nên revoke session.
 */
export function compareFingerprints(
  stored: { ipSubnet?: string | null; userAgentHash?: string | null; deviceId?: string | null },
  current: RequestFingerprint
): { mismatchScore: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // IP subnet thay đổi → cảnh báo (mobile network có thể đổi)
  if (stored.ipSubnet && stored.ipSubnet !== "unknown" && stored.ipSubnet !== current.ipSubnet) {
    score += 1;
    reasons.push("ip_subnet_changed");
  }

  // UA hash đổi → nguy hiểm hơn (cùng người không tự nhiên đổi browser/OS)
  if (stored.userAgentHash && stored.userAgentHash !== current.userAgentHash) {
    score += 2;
    reasons.push("user_agent_changed");
  }

  // DeviceId đổi (nếu có cả 2 bên) → cảnh báo cao
  if (stored.deviceId && current.deviceId && stored.deviceId !== current.deviceId) {
    score += 2;
    reasons.push("device_id_changed");
  }

  return { mismatchScore: score, reasons };
}
