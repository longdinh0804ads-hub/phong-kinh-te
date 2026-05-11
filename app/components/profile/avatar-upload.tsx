"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getInitials } from "@/lib/utils";
import { Camera, Loader2, Trash2 } from "lucide-react";

interface AvatarUploadProps {
  userName: string;
  currentImage?: string | null;
  /** Kích thước Avatar */
  size?: "md" | "lg" | "xl";
  /** Server truyền xuống: upload có khả dụng trên environment này không */
  uploadEnabled?: boolean;
}

const SIZE_CLASS = {
  md: "h-16 w-16 text-base",
  lg: "h-20 w-20 text-xl",
  xl: "h-24 w-24 text-2xl",
};

const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

export function AvatarUpload({ userName, currentImage, size = "lg", uploadEnabled = true }: AvatarUploadProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const displayUrl = previewUrl || currentImage || undefined;
  const sizeClass = SIZE_CLASS[size];

  function handlePick() {
    fileRef.current?.click();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset để có thể chọn cùng file lại
    if (!file) return;

    setError(null);

    if (!ALLOWED.includes(file.type)) {
      setError("Chỉ chấp nhận PNG, JPG, WEBP");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`Ảnh quá lớn (tối đa ${MAX_BYTES / 1024 / 1024}MB)`);
      return;
    }

    // Preview ngay
    const reader = new FileReader();
    reader.onload = (ev) => setPreviewUrl(ev.target?.result as string);
    reader.readAsDataURL(file);

    // Upload
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      try {
        const res = await fetch("/api/profile/avatar", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Upload thất bại");
          setPreviewUrl(null);
        } else {
          // Refresh để header/sidebar cập nhật
          router.refresh();
        }
      } catch (err: any) {
        setError(err?.message || "Lỗi kết nối");
        setPreviewUrl(null);
      }
    });
  }

  async function handleRemove() {
    if (!currentImage && !previewUrl) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/profile/avatar", { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Xóa thất bại");
        } else {
          setPreviewUrl(null);
          router.refresh();
        }
      } catch (err: any) {
        setError(err?.message || "Lỗi kết nối");
      }
    });
  }

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
      <div className="relative group">
        <Avatar className={sizeClass}>
          {displayUrl && <AvatarImage src={displayUrl} alt={userName} />}
          <AvatarFallback className="text-xl">{getInitials(userName)}</AvatarFallback>
        </Avatar>
        {/* Overlay hover */}
        <button
          type="button"
          onClick={handlePick}
          disabled={isPending}
          aria-label="Đổi ảnh đại diện"
          className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white disabled:cursor-not-allowed"
        >
          {isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Camera className="h-5 w-5" />
          )}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {uploadEnabled ? (
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePick}
                disabled={isPending}
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
                {currentImage || previewUrl ? "Đổi ảnh" : "Tải ảnh lên"}
              </Button>
              {(currentImage || previewUrl) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRemove}
                  disabled={isPending}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  Xóa ảnh
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              PNG, JPG hoặc WEBP. Tối đa {MAX_BYTES / 1024 / 1024}MB.
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            Ảnh đại diện tạm thời chưa khả dụng trên môi trường này. Hệ thống dùng chữ cái đầu tên thay thế.
          </p>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}
