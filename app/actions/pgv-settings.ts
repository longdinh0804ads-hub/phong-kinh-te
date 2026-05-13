"use server";

/**
 * Server actions cho cấu hình Phiếu giao việc (PGV-KT):
 *   - Cập nhật người ký (tên + chức danh)
 *   - Upload ảnh chữ ký
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { requireAuth } from "@/lib/session";
import { isSuperAdmin, isTopLeader } from "@/lib/permissions";
import { setSetting, getSetting } from "@/lib/system-settings";
import { PGV_SETTINGS } from "@/lib/assignment-sheet";

const signerSchema = z.object({
  name: z.string().min(2).max(100),
  title: z.string().min(2).max(100),
});

export async function updatePgvSigner(input: z.infer<typeof signerSchema>): Promise<{
  ok: boolean;
  error?: string;
}> {
  const user = await requireAuth();
  if (!isSuperAdmin(user.role) && !isTopLeader(user.role)) {
    return { ok: false, error: "Không đủ quyền" };
  }
  const parsed = signerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dữ liệu không hợp lệ" };

  await setSetting(PGV_SETTINGS.SIGNER_NAME, parsed.data.name, {
    updatedById: user.id,
    isEncrypted: false,
    category: "pgv",
    description: "Tên người ký Phiếu giao việc",
  });
  await setSetting(PGV_SETTINGS.SIGNER_TITLE, parsed.data.title, {
    updatedById: user.id,
    isEncrypted: false,
    category: "pgv",
    description: "Chức danh người ký",
  });
  revalidatePath("/admin/pgv");
  return { ok: true };
}

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_SIZE = 1024 * 1024 * 2; // 2MB
const SIG_DIR = path.join(process.cwd(), "public", "signatures");

export async function uploadSignature(formData: FormData): Promise<{
  ok: boolean;
  url?: string;
  error?: string;
}> {
  const user = await requireAuth();
  if (!isSuperAdmin(user.role) && !isTopLeader(user.role)) {
    return { ok: false, error: "Không đủ quyền" };
  }

  const file = formData.get("file") as File | null;
  if (!file) return { ok: false, error: "Thiếu file" };
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { ok: false, error: "Chỉ chấp nhận PNG, JPG, WebP" };
  }
  if (file.size > MAX_SIZE) {
    return { ok: false, error: "File quá lớn (tối đa 2MB)" };
  }

  // Vercel: filesystem read-only → cảnh báo
  if (process.env.VERCEL) {
    return {
      ok: false,
      error:
        "Trên Vercel không upload được file vào public/. Hãy upload chữ ký qua S3/Cloudinary rồi paste URL vào setting.",
    };
  }

  try {
    await fs.mkdir(SIG_DIR, { recursive: true });
    const ext = file.type === "image/png" ? "png" : file.type === "image/jpeg" ? "jpg" : "webp";
    const filename = `pgv-signer-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(path.join(SIG_DIR, filename), buffer);

    const url = `/signatures/${filename}`;
    await setSetting(PGV_SETTINGS.SIGNATURE_URL, url, {
      updatedById: user.id,
      isEncrypted: false,
      category: "pgv",
      description: "URL ảnh chữ ký Trưởng phòng",
    });

    // Xóa file cũ (giữ 1 file gần nhất)
    const old = await fs.readdir(SIG_DIR).catch(() => []);
    for (const f of old) {
      if (f !== filename && f.startsWith("pgv-signer-")) {
        await fs.unlink(path.join(SIG_DIR, f)).catch(() => {});
      }
    }

    revalidatePath("/admin/pgv");
    return { ok: true, url };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Lỗi upload" };
  }
}

export async function setSignatureUrl(url: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const user = await requireAuth();
  if (!isSuperAdmin(user.role) && !isTopLeader(user.role)) {
    return { ok: false, error: "Không đủ quyền" };
  }
  // Cho phép trống → xóa setting
  await setSetting(PGV_SETTINGS.SIGNATURE_URL, url.trim(), {
    updatedById: user.id,
    isEncrypted: false,
    category: "pgv",
    description: "URL ảnh chữ ký Trưởng phòng",
  });
  revalidatePath("/admin/pgv");
  return { ok: true };
}

export async function getPgvSettings(): Promise<{
  signerName: string;
  signerTitle: string;
  signatureUrl: string | null;
}> {
  const [name, title, url] = await Promise.all([
    getSetting(PGV_SETTINGS.SIGNER_NAME),
    getSetting(PGV_SETTINGS.SIGNER_TITLE),
    getSetting(PGV_SETTINGS.SIGNATURE_URL),
  ]);
  return {
    signerName: name || "Vũ Văn Tuấn",
    signerTitle: title || "Trưởng phòng",
    signatureUrl: url,
  };
}
