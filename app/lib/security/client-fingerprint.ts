/**
 * Client-side device fingerprint:
 *   SHA-256 hash của (canvas + WebGL + screen + timezone + language + fonts hint)
 *
 * Mục tiêu:
 *  - Cùng browser + OS → cùng hash (ổn định ~95%)
 *  - Khác browser HOẶC khác máy → khác hash
 *  - KHÔNG dùng để tracking ngoài trang web - chỉ phục vụ phát hiện thiết bị lạ
 *
 * Lưu ý privacy: chỉ chạy sau khi user submit form (consent ngầm),
 * không log bất kỳ thông tin định danh nào ra ngoài DB.
 */
"use client";

const FP_STORAGE_KEY = "pkt.device.fp";

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function canvasFingerprint(): string {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "no-canvas";
    ctx.textBaseline = "top";
    ctx.font = "14px Arial";
    ctx.fillStyle = "#f60";
    ctx.fillRect(0, 0, 100, 40);
    ctx.fillStyle = "#069";
    ctx.fillText("PKT-fingerprint-2026", 2, 2);
    ctx.strokeStyle = "rgba(120,180,200,0.5)";
    ctx.strokeRect(0, 0, 200, 50);
    return canvas.toDataURL().slice(-100); // last 100 chars đủ phân biệt
  } catch {
    return "canvas-err";
  }
}

function webglFingerprint(): string {
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")) as
      | WebGLRenderingContext
      | null;
    if (!gl) return "no-webgl";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return gl.getParameter(gl.VENDOR) + "|" + gl.getParameter(gl.RENDERER);
    return (
      String(gl.getParameter((ext as any).UNMASKED_VENDOR_WEBGL || 0x9245)) +
      "|" +
      String(gl.getParameter((ext as any).UNMASKED_RENDERER_WEBGL || 0x9246))
    );
  } catch {
    return "webgl-err";
  }
}

function gatherFingerprint(): string {
  if (typeof window === "undefined") return "ssr";
  const parts = [
    navigator.userAgent || "",
    navigator.language || "",
    (navigator.languages || []).join(","),
    screen.width + "x" + screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    (navigator as any).hardwareConcurrency || 0,
    (navigator as any).maxTouchPoints || 0,
    canvasFingerprint(),
    webglFingerprint(),
  ];
  return parts.join("||");
}

/**
 * Lấy device fingerprint, cache vào localStorage để consistent giữa các page load.
 */
export async function getDeviceFingerprint(): Promise<string> {
  if (typeof window === "undefined") return "ssr";
  try {
    const cached = localStorage.getItem(FP_STORAGE_KEY);
    if (cached && cached.length === 64) return cached;
  } catch {}

  const raw = gatherFingerprint();
  const hash = await sha256Hex(raw);

  try {
    localStorage.setItem(FP_STORAGE_KEY, hash);
  } catch {}

  return hash;
}

/** Clear cache (vd khi user logout chủ động) */
export function clearDeviceFingerprint(): void {
  try {
    localStorage.removeItem(FP_STORAGE_KEY);
  } catch {}
}
