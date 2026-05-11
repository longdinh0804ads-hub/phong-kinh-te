/**
 * Helper ghi SecurityEvent + gửi email cảnh báo (qua Resend nếu cấu hình).
 */
import { db } from "@/lib/db";

export type SecurityEventType =
  | "NEW_DEVICE"
  | "NEW_LOCATION"
  | "ACCOUNT_LOCKED"
  | "PASSWORD_CHANGED"
  | "2FA_ENABLED"
  | "2FA_DISABLED"
  | "2FA_BACKUP_USED"
  | "SESSION_REVOKED"
  | "SUSPICIOUS_LOGIN"
  | "IMPOSSIBLE_TRAVEL"
  | "MULTIPLE_FAIL_LOGIN"
  | "LOGIN_OFFHOURS"
  | "DEVICE_TRUSTED";

export type Severity = "info" | "warning" | "critical";

export async function logSecurityEvent(params: {
  userId: string;
  eventType: SecurityEventType;
  severity?: Severity;
  description: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const event = await db.securityEvent.create({
    data: {
      userId: params.userId,
      eventType: params.eventType,
      severity: params.severity || "info",
      description: params.description,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      metadata: (params.metadata as never) ?? undefined,
      emailSent: false,
    },
  });
  return event.id;
}

/**
 * Đánh dấu email đã gửi cho 1 event (gọi sau khi gửi Resend thành công).
 */
export async function markEventEmailSent(eventId: string): Promise<void> {
  await db.securityEvent.update({
    where: { id: eventId },
    data: { emailSent: true },
  });
}

/**
 * Get sự kiện gần đây của user (cho UI /settings/security).
 */
export async function getRecentSecurityEvents(userId: string, limit = 50) {
  return db.securityEvent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
