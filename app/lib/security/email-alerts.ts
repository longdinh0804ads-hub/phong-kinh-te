/**
 * Email cảnh báo bảo mật qua Resend.
 *
 * Yêu cầu env:
 *   RESEND_API_KEY      = re_xxx
 *   RESEND_FROM_EMAIL   = security@yourdomain.com (đã verify domain trên Resend)
 *   APP_NAME            = "PKT Trần Phú" (mặc định)
 *   APP_URL             = https://yourdomain.com (cho link xác nhận)
 *
 * Nếu chưa cấu hình → email bị skip silently (log warning).
 * Chú ý: KHÔNG gửi PII nhạy cảm trong subject (subject có thể vào notification preview).
 */
import { Resend } from "resend";

const APP_NAME = process.env.APP_NAME || "PKT Trần Phú";
const APP_URL = process.env.APP_URL || process.env.BETTER_AUTH_URL || "http://localhost:4000";

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

function getFromAddress(): string {
  return process.env.RESEND_FROM_EMAIL || "security@example.com";
}

export interface SendResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
  id?: string;
}

interface EmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

async function sendRaw(p: EmailParams): Promise<SendResult> {
  const client = getClient();
  if (!client) {
    console.warn("[email-alerts] RESEND_API_KEY chưa cấu hình - skip:", p.subject);
    return { ok: false, skipped: true, error: "RESEND_API_KEY chưa cấu hình" };
  }
  try {
    const res = await client.emails.send({
      from: getFromAddress(),
      to: p.to,
      subject: p.subject,
      html: p.html,
      text: p.text,
    });
    if (res.error) {
      console.error("[email-alerts] Resend error:", res.error);
      return { ok: false, error: res.error.message };
    }
    return { ok: true, id: res.data?.id };
  } catch (e: any) {
    console.error("[email-alerts] Send fail:", e);
    return { ok: false, error: e?.message || "Unknown error" };
  }
}

// ====== TEMPLATES ======

function wrapHtml(body: string, title: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escape(title)}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f7f9fc;color:#111;">
  <div style="background:#fff;border-radius:8px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
    <div style="border-bottom:2px solid #1e3a8a;padding-bottom:12px;margin-bottom:16px;">
      <h2 style="margin:0;color:#1e3a8a;">${escape(APP_NAME)}</h2>
      <p style="margin:4px 0 0;color:#666;font-size:13px;">Cảnh báo bảo mật</p>
    </div>
    ${body}
    <hr style="border:none;border-top:1px solid #eee;margin:20px 0;"/>
    <p style="font-size:11px;color:#999;margin:0;">
      Email tự động từ ${escape(APP_NAME)}. Vui lòng KHÔNG trả lời email này.<br/>
      Nếu bạn không thực hiện hành động này, vui lòng liên hệ quản trị viên ngay.
    </p>
  </div>
</body></html>`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface NewDeviceInfo {
  email: string;
  userName: string;
  deviceName: string;
  ipAddress: string;
  geoLocation?: string | null;
  loginAt: Date;
  confirmUrl?: string;
}

export async function sendNewDeviceAlert(p: NewDeviceInfo): Promise<SendResult> {
  const time = p.loginAt.toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "long",
    timeStyle: "short",
  });
  const body = `
    <p>Xin chào <strong>${escape(p.userName)}</strong>,</p>
    <p>Chúng tôi phát hiện một lần đăng nhập từ <strong>thiết bị mới</strong>:</p>
    <table style="width:100%;border-collapse:collapse;margin:12px 0;">
      <tr><td style="padding:6px 0;color:#666;width:130px;">Thiết bị:</td><td style="padding:6px 0;"><strong>${escape(p.deviceName)}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#666;">Địa chỉ IP:</td><td style="padding:6px 0;"><code>${escape(p.ipAddress)}</code></td></tr>
      ${p.geoLocation ? `<tr><td style="padding:6px 0;color:#666;">Khu vực:</td><td style="padding:6px 0;">${escape(p.geoLocation)}</td></tr>` : ""}
      <tr><td style="padding:6px 0;color:#666;">Thời gian:</td><td style="padding:6px 0;">${escape(time)}</td></tr>
    </table>
    ${
      p.confirmUrl
        ? `<p>Nếu đây là bạn, nhấn nút bên dưới để xác nhận tin cậy thiết bị này (giảm cảnh báo lần sau):</p>
           <p style="text-align:center;margin:20px 0;">
             <a href="${escape(p.confirmUrl)}" style="background:#1e3a8a;color:#fff;padding:10px 24px;text-decoration:none;border-radius:6px;display:inline-block;">Xác nhận tin cậy thiết bị</a>
           </p>`
        : ""
    }
    <p style="background:#fef3c7;padding:12px;border-radius:6px;border-left:3px solid #d97706;">
      ⚠ <strong>Nếu không phải bạn:</strong> Đổi mật khẩu ngay tại
      <a href="${escape(APP_URL)}/settings/security">${APP_URL}/settings/security</a>
      và liên hệ quản trị viên.
    </p>
  `;
  return sendRaw({
    to: p.email,
    subject: `[${APP_NAME}] Đăng nhập từ thiết bị mới`,
    html: wrapHtml(body, "Đăng nhập từ thiết bị mới"),
    text: `Phát hiện đăng nhập mới từ ${p.deviceName}, IP ${p.ipAddress}, lúc ${time}. Nếu không phải bạn, đổi mật khẩu ngay.`,
  });
}

export async function sendAccountLockedAlert(p: {
  email: string;
  userName: string;
  ipAddress: string;
  attemptCount: number;
  unlockAt?: Date;
}): Promise<SendResult> {
  const body = `
    <p>Xin chào <strong>${escape(p.userName)}</strong>,</p>
    <p>Tài khoản của bạn vừa bị <strong>tạm khóa</strong> do phát hiện <strong>${p.attemptCount} lần đăng nhập thất bại liên tiếp</strong> từ địa chỉ IP <code>${escape(p.ipAddress)}</code>.</p>
    ${p.unlockAt ? `<p>Tài khoản sẽ tự mở khóa sau: <strong>${escape(p.unlockAt.toLocaleString("vi-VN"))}</strong></p>` : "<p>Vui lòng liên hệ quản trị viên để mở khóa.</p>"}
    <p style="background:#fee2e2;padding:12px;border-radius:6px;border-left:3px solid #dc2626;">
      🚨 Nếu không phải bạn cố gắng đăng nhập, có thể tài khoản đang bị tấn công. <strong>Đổi mật khẩu ngay sau khi mở khóa</strong>.
    </p>
  `;
  return sendRaw({
    to: p.email,
    subject: `[${APP_NAME}] Tài khoản bị tạm khóa`,
    html: wrapHtml(body, "Tài khoản bị tạm khóa"),
    text: `Tài khoản bị khóa do ${p.attemptCount} lần thử sai từ ${p.ipAddress}.`,
  });
}

export async function sendPasswordChangedAlert(p: {
  email: string;
  userName: string;
  ipAddress: string;
  changedAt: Date;
}): Promise<SendResult> {
  const time = p.changedAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  const body = `
    <p>Xin chào <strong>${escape(p.userName)}</strong>,</p>
    <p>Mật khẩu tài khoản của bạn đã được <strong>thay đổi thành công</strong> lúc ${escape(time)} từ IP <code>${escape(p.ipAddress)}</code>.</p>
    <p>Tất cả các phiên đăng nhập khác đã bị đăng xuất.</p>
    <p style="background:#fee2e2;padding:12px;border-radius:6px;border-left:3px solid #dc2626;">
      🚨 Nếu không phải bạn thực hiện, hãy <strong>liên hệ quản trị viên ngay lập tức</strong>.
    </p>
  `;
  return sendRaw({
    to: p.email,
    subject: `[${APP_NAME}] Mật khẩu đã được thay đổi`,
    html: wrapHtml(body, "Mật khẩu đã được thay đổi"),
  });
}

export async function send2FAEnabledAlert(p: {
  email: string;
  userName: string;
}): Promise<SendResult> {
  const body = `
    <p>Xin chào <strong>${escape(p.userName)}</strong>,</p>
    <p>Xác thực 2 yếu tố (2FA) đã được <strong>kích hoạt</strong> cho tài khoản của bạn.</p>
    <p>Từ giờ, mỗi lần đăng nhập sẽ cần nhập mã 6 chữ số từ ứng dụng Authenticator của bạn.</p>
    <p style="background:#fef3c7;padding:12px;border-radius:6px;border-left:3px solid #d97706;">
      💡 Vui lòng <strong>lưu các mã backup</strong> ở nơi an toàn (in ra hoặc cất trong két). Mã backup là phương án cuối khi bạn mất điện thoại.
    </p>
  `;
  return sendRaw({
    to: p.email,
    subject: `[${APP_NAME}] Đã bật xác thực 2 yếu tố`,
    html: wrapHtml(body, "Đã bật xác thực 2 yếu tố"),
  });
}

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.RESEND_FROM_EMAIL;
}
