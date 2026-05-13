"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  updatePgvSigner,
  uploadSignature,
  setSignatureUrl,
} from "@/actions/pgv-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Upload, CheckCircle2, AlertTriangle, Trash2 } from "lucide-react";

interface Settings {
  signerName: string;
  signerTitle: string;
  signatureUrl: string | null;
}

export function PgvSettingsClient({ initial }: { initial: Settings }) {
  const router = useRouter();
  const [name, setName] = useState(initial.signerName);
  const [title, setTitle] = useState(initial.signerTitle);
  const [urlInput, setUrlInput] = useState(initial.signatureUrl || "");
  const [savingSigner, setSavingSigner] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function saveSigner() {
    setSavingSigner(true);
    setMsg(null);
    const r = await updatePgvSigner({ name, title });
    setSavingSigner(false);
    if (r.ok) {
      setMsg({ type: "ok", text: "Đã lưu người ký" });
      router.refresh();
    } else {
      setMsg({ type: "err", text: r.error || "Lỗi" });
    }
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    const r = await uploadSignature(fd);
    setUploading(false);
    if (r.ok) {
      setMsg({ type: "ok", text: "Đã upload chữ ký" });
      router.refresh();
    } else {
      setMsg({ type: "err", text: r.error || "Lỗi upload" });
    }
  }

  async function saveUrl() {
    setUploading(true);
    setMsg(null);
    const r = await setSignatureUrl(urlInput);
    setUploading(false);
    if (r.ok) {
      setMsg({ type: "ok", text: "Đã cập nhật URL" });
      router.refresh();
    } else {
      setMsg({ type: "err", text: r.error || "Lỗi" });
    }
  }

  return (
    <div className="space-y-5">
      {/* Người ký */}
      <div className="space-y-3">
        <div>
          <Label>Tên người ký</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vũ Văn Tuấn" />
        </div>
        <div>
          <Label>Chức danh</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Trưởng phòng" />
        </div>
        <Button onClick={saveSigner} disabled={savingSigner} size="sm">
          {savingSigner ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Lưu người ký
        </Button>
      </div>

      <hr />

      {/* Chữ ký scan */}
      <div className="space-y-3">
        <div>
          <Label>Chữ ký scan</Label>
          <p className="text-xs text-muted-foreground mb-2">
            Ảnh chữ ký (PNG nền trong suốt khuyến nghị), tối đa 2MB. Sẽ hiển thị trong vùng ký
            của mọi phiếu giao việc.
          </p>
          {initial.signatureUrl ? (
            <div className="border rounded-md p-3 bg-muted/30 flex items-center gap-3">
              <img
                src={initial.signatureUrl}
                alt="Chữ ký"
                className="max-h-20 max-w-[200px] object-contain"
              />
              <div className="text-xs text-muted-foreground flex-1 truncate">
                {initial.signatureUrl}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setUrlInput("");
                  saveUrl();
                }}
                className="text-destructive"
              >
                <Trash2 className="h-4 w-4" /> Xóa
              </Button>
            </div>
          ) : (
            <div className="border-2 border-dashed rounded-md p-6 text-center text-sm text-muted-foreground">
              Chưa có chữ ký
            </div>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
            }}
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload ảnh
          </Button>
        </div>

        <div className="pt-2 border-t">
          <Label className="text-xs text-muted-foreground">
            Hoặc paste URL ảnh (Cloudinary / S3 / Google Drive direct link):
          </Label>
          <div className="flex gap-2 mt-1">
            <Input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://..."
            />
            <Button onClick={saveUrl} disabled={uploading} size="sm">
              Lưu URL
            </Button>
          </div>
        </div>
      </div>

      {msg && (
        <div
          className={
            msg.type === "ok"
              ? "rounded-md bg-emerald-50 border border-emerald-200 p-2 text-sm text-emerald-700 flex items-center gap-2"
              : "rounded-md bg-destructive/10 border border-destructive/20 p-2 text-sm text-destructive flex items-center gap-2"
          }
        >
          {msg.type === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {msg.text}
        </div>
      )}
    </div>
  );
}
