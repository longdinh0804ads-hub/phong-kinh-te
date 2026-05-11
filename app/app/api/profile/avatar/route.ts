// Upload/xóa avatar người dùng. Lưu file vào public/uploads/avatars/{userId}.{ext}.
// Authentication bắt buộc. Validate mime + size + magic bytes.

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const MAX_BYTES = 3 * 1024 * 1024; // 3MB
const ALLOWED_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
};

// Magic bytes header để verify file là image thật (chống fake mime)
function detectImageType(buf: Buffer): "png" | "jpg" | "webp" | null {
  if (buf.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) return "png";
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  // WEBP: "RIFF" .... "WEBP"
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return "webp";
  return null;
}

const AVATAR_DIR = path.resolve(process.cwd(), "public", "uploads", "avatars");

async function ensureDir() {
  await fs.mkdir(AVATAR_DIR, { recursive: true });
}

/** Xóa mọi file avatar cũ của user (tất cả ext) */
async function removeOldAvatars(userId: string) {
  try {
    const entries = await fs.readdir(AVATAR_DIR);
    for (const name of entries) {
      if (name.startsWith(userId + ".")) {
        await fs.unlink(path.join(AVATAR_DIR, name)).catch(() => {});
      }
    }
  } catch {
    // dir chưa tồn tại - ignore
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Vercel (serverless) filesystem ephemeral - file mất sau mỗi deploy.
  // Tạm thời disable upload trên Vercel; user dùng initials làm avatar mặc định.
  // Khi nâng cấp sang Vercel Blob hoặc Supabase Storage, bỏ guard này.
  if (process.env.VERCEL === "1" || process.env.DISABLE_AVATAR_UPLOAD === "1") {
    return NextResponse.json(
      {
        error:
          "Chức năng upload ảnh đại diện tạm thời chưa khả dụng trên môi trường này. Liên hệ Trưởng phòng nếu cần.",
      },
      { status: 503 }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Không có file" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Ảnh quá lớn (tối đa ${MAX_BYTES / 1024 / 1024}MB)` },
      { status: 400 }
    );
  }

  const declaredMime = file.type;
  if (!ALLOWED_MIME[declaredMime]) {
    return NextResponse.json(
      { error: "Chỉ chấp nhận ảnh PNG, JPG, WEBP" },
      { status: 400 }
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const detected = detectImageType(buf);
  if (!detected) {
    return NextResponse.json(
      { error: "File không phải ảnh hợp lệ" },
      { status: 400 }
    );
  }

  try {
    await ensureDir();
    // Xóa avatar cũ (kể cả khác extension) để không bị orphan file
    await removeOldAvatars(user.id);

    const filename = `${user.id}.${detected}`;
    const fullPath = path.join(AVATAR_DIR, filename);

    // Defense in depth: đảm bảo fullPath vẫn nằm trong AVATAR_DIR
    if (!fullPath.startsWith(AVATAR_DIR + path.sep)) {
      return NextResponse.json({ error: "Đường dẫn không hợp lệ" }, { status: 400 });
    }

    await fs.writeFile(fullPath, buf);

    // Cache busting bằng timestamp - browser luôn fetch ảnh mới sau khi upload
    const publicUrl = `/uploads/avatars/${filename}?v=${Date.now()}`;

    await db.user.update({
      where: { id: user.id },
      data: { image: publicUrl },
    });

    return NextResponse.json({ success: true, image: publicUrl });
  } catch (e: any) {
    console.error("[avatar-upload] Failed:", e?.message);
    return NextResponse.json(
      { error: "Không thể lưu ảnh: " + (e?.message || "lỗi không xác định") },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await removeOldAvatars(user.id);
    await db.user.update({
      where: { id: user.id },
      data: { image: null },
    });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[avatar-delete] Failed:", e?.message);
    return NextResponse.json(
      { error: "Không thể xóa ảnh: " + (e?.message || "lỗi không xác định") },
      { status: 500 }
    );
  }
}
