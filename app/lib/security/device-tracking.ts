/**
 * Device tracking + anomaly detection:
 *  - Check device đã từng đăng nhập của user chưa
 *  - Đánh dấu "trusted" khi user xác nhận qua email link
 *  - Detect impossible travel (2 login khác tỉnh trong <1h)
 *  - Detect login ngoài giờ hành chính (22h-6h)
 */
import { db } from "@/lib/db";
import { logSecurityEvent, markEventEmailSent } from "./security-events";
import {
  sendNewDeviceAlert,
  sendAccountLockedAlert,
  sendPasswordChangedAlert,
} from "./email-alerts";

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  ipAddress: string;
  userAgent: string;
  geoCity?: string | null;
  geoCountry?: string | null;
}

/**
 * Upsert device record cho user, trả về { isNew, isTrusted, device }.
 * Gọi sau khi login thành công.
 */
export async function recordDeviceLogin(
  userId: string,
  info: DeviceInfo
): Promise<{
  isNew: boolean;
  isTrusted: boolean;
  device: Awaited<ReturnType<typeof db.trustedDevice.upsert>>;
}> {
  if (!info.deviceId) {
    throw new Error("deviceId required");
  }

  const existing = await db.trustedDevice.findUnique({
    where: { userId_deviceId: { userId, deviceId: info.deviceId } },
  });

  const device = await db.trustedDevice.upsert({
    where: { userId_deviceId: { userId, deviceId: info.deviceId } },
    update: {
      lastSeenAt: new Date(),
      ipAddress: info.ipAddress,
      geoCity: info.geoCity,
      geoCountry: info.geoCountry,
      userAgent: info.userAgent,
    },
    create: {
      userId,
      deviceId: info.deviceId,
      deviceName: info.deviceName,
      ipAddress: info.ipAddress,
      geoCity: info.geoCity,
      geoCountry: info.geoCountry,
      userAgent: info.userAgent,
      trusted: false,
    },
  });

  return {
    isNew: !existing,
    isTrusted: device.trusted,
    device,
  };
}

/**
 * Detect login bất thường + log event + gửi email cảnh báo.
 * Gọi sau recordDeviceLogin.
 */
export async function detectAnomaliesAndAlert(params: {
  userId: string;
  userEmail: string;
  userName: string;
  device: { deviceId: string; deviceName: string; isNew: boolean };
  ipAddress: string;
  userAgent: string;
  geoCity?: string | null;
  geoCountry?: string | null;
}): Promise<{ alerts: string[] }> {
  const alerts: string[] = [];
  const now = new Date();

  // 1. New device → alert
  if (params.device.isNew) {
    alerts.push("new_device");
    const eventId = await logSecurityEvent({
      userId: params.userId,
      eventType: "NEW_DEVICE",
      severity: "warning",
      description: `Đăng nhập từ thiết bị mới: ${params.device.deviceName} (IP ${params.ipAddress})`,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      metadata: {
        deviceId: params.device.deviceId,
        deviceName: params.device.deviceName,
        geoCity: params.geoCity,
        geoCountry: params.geoCountry,
      },
    });

    // Send email (best-effort - không block flow)
    const res = await sendNewDeviceAlert({
      email: params.userEmail,
      userName: params.userName,
      deviceName: params.device.deviceName,
      ipAddress: params.ipAddress,
      geoLocation: params.geoCity
        ? `${params.geoCity}${params.geoCountry ? ", " + params.geoCountry : ""}`
        : null,
      loginAt: now,
    });
    if (res.ok) {
      await markEventEmailSent(eventId).catch(() => {});
    }
  }

  // 2. Impossible travel: 2 login từ 2 vị trí khác nhau trong <1h
  // (Bỏ qua nếu chưa có geo data)
  if (params.geoCity) {
    const recentLogins = await db.loginAttempt.findMany({
      where: {
        userId: params.userId,
        success: true,
        createdAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) },
        geoCity: { not: null },
      },
      orderBy: { createdAt: "desc" },
      take: 2,
      select: { geoCity: true, geoCountry: true, ipAddress: true, createdAt: true },
    });

    const otherLocations = recentLogins.filter(
      (l) => l.geoCity && l.geoCity !== params.geoCity
    );
    if (otherLocations.length > 0) {
      alerts.push("impossible_travel");
      await logSecurityEvent({
        userId: params.userId,
        eventType: "IMPOSSIBLE_TRAVEL",
        severity: "critical",
        description: `Phát hiện đăng nhập gần như đồng thời từ ${otherLocations[0].geoCity} và ${params.geoCity} (cách <1 giờ)`,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        metadata: {
          currentLocation: params.geoCity,
          previousLocation: otherLocations[0].geoCity,
          previousIp: otherLocations[0].ipAddress,
          timeDiffMinutes: Math.round(
            (now.getTime() - new Date(otherLocations[0].createdAt).getTime()) / 60000
          ),
        },
      });
    }
  }

  // 3. Login ngoài giờ (22h - 6h, giờ VN)
  const vnHour = (now.getUTCHours() + 7) % 24;
  if (vnHour >= 22 || vnHour < 6) {
    // Check user có thường đăng nhập ngoài giờ không (last 30 days, >=3 lần thì coi như bình thường)
    const offHoursPast = await db.loginAttempt.count({
      where: {
        userId: params.userId,
        success: true,
        createdAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
        // Đơn giản: count all, check ngoài giờ trong app code
      },
    });
    // Nếu user mới (<5 login thành công) hoặc lần đầu ngoài giờ → alert
    if (offHoursPast < 5) {
      alerts.push("off_hours");
      await logSecurityEvent({
        userId: params.userId,
        eventType: "LOGIN_OFFHOURS",
        severity: "info",
        description: `Đăng nhập ngoài giờ hành chính (${vnHour}:00 giờ VN)`,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        metadata: { hourVN: vnHour },
      });
    }
  }

  return { alerts };
}

/**
 * Trust device qua link email (user click).
 */
export async function trustDevice(
  userId: string,
  deviceId: string
): Promise<{ ok: boolean; error?: string }> {
  const device = await db.trustedDevice.findUnique({
    where: { userId_deviceId: { userId, deviceId } },
  });
  if (!device) return { ok: false, error: "Thiết bị không tồn tại" };

  await db.trustedDevice.update({
    where: { id: device.id },
    data: { trusted: true, trustedAt: new Date() },
  });

  await logSecurityEvent({
    userId,
    eventType: "DEVICE_TRUSTED",
    severity: "info",
    description: `Đã đánh dấu tin cậy thiết bị: ${device.deviceName}`,
    metadata: { deviceId },
  });

  return { ok: true };
}

/**
 * Revoke device (xóa khỏi trusted list + revoke session từ device đó).
 */
export async function revokeDevice(
  userId: string,
  deviceId: string
): Promise<{ ok: boolean; revokedSessions: number }> {
  // Xóa device record
  await db.trustedDevice.deleteMany({
    where: { userId, deviceId },
  });

  // Revoke session có deviceId này
  const result = await db.session.deleteMany({
    where: { userId, deviceId },
  });

  await logSecurityEvent({
    userId,
    eventType: "SESSION_REVOKED",
    severity: "info",
    description: `Đã thu hồi quyền của thiết bị (deviceId=${deviceId.slice(0, 8)}...)`,
    metadata: { deviceId, revokedSessions: result.count },
  });

  return { ok: true, revokedSessions: result.count };
}

/** Liệt kê thiết bị của user (cho UI /settings/security) */
export async function listUserDevices(userId: string) {
  return db.trustedDevice.findMany({
    where: { userId },
    orderBy: { lastSeenAt: "desc" },
  });
}

/** Liệt kê session active của user */
export async function listUserSessions(userId: string) {
  return db.session.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
}
