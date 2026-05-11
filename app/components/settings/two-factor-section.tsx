"use client";

import { useState } from "react";
import { setup2FA, enable2FA, disable2FA, regenerateBackupCodes } from "@/actions/two-factor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck, ShieldOff, Copy, RefreshCw, AlertTriangle } from "lucide-react";

interface Props {
  enabled: boolean;
  required: boolean;
  backupCodeCount: number;
}

type Step = "idle" | "setup-qr" | "enable-verify" | "backup-codes" | "disable-confirm";

export function TwoFactorSection({ enabled, required, backupCodeCount }: Props) {
  const [step, setStep] = useState<Step>("idle");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSetup() {
    setLoading(true);
    setError(null);
    const r = await setup2FA();
    if (r.ok && r.qrDataUrl && r.secret) {
      setQrDataUrl(r.qrDataUrl);
      setSecret(r.secret);
      setStep("setup-qr");
    } else {
      setError(r.error || "Không thể bắt đầu cấu hình");
    }
    setLoading(false);
  }

  async function handleEnable() {
    if (!secret) return;
    setLoading(true);
    setError(null);
    const r = await enable2FA(secret, code);
    if (r.ok && r.backupCodes) {
      setBackupCodes(r.backupCodes);
      setStep("backup-codes");
      setCode("");
    } else {
      setError(r.error || "Xác thực thất bại");
    }
    setLoading(false);
  }

  async function handleDisable() {
    setLoading(true);
    setError(null);
    const r = await disable2FA(pw);
    if (r.ok) {
      setPw("");
      setStep("idle");
      // Reload page để cập nhật enabled state
      window.location.reload();
    } else {
      setError(r.error || "Không thể tắt 2FA");
    }
    setLoading(false);
  }

  async function handleRegenerate() {
    setLoading(true);
    setError(null);
    const r = await regenerateBackupCodes(pw);
    if (r.ok && r.backupCodes) {
      setBackupCodes(r.backupCodes);
      setPw("");
      setStep("backup-codes");
    } else {
      setError(r.error || "Không thể sinh lại mã");
    }
    setLoading(false);
  }

  function copyBackup() {
    if (!backupCodes) return;
    navigator.clipboard.writeText(backupCodes.join("\n"));
  }

  // === RENDER ===

  if (enabled && step === "idle") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-emerald-700 text-sm">
          <ShieldCheck className="h-4 w-4" />
          <span>2FA đang bật. Còn {backupCodeCount} mã backup chưa dùng.</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setStep("disable-confirm");
              setError(null);
            }}
            disabled={required}
            title={required ? "Vai trò bắt buộc 2FA, không thể tắt" : undefined}
          >
            <ShieldOff className="h-4 w-4" /> Tắt 2FA
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setStep("disable-confirm");
              setError(null);
            }}
          >
            <RefreshCw className="h-4 w-4" /> Sinh lại mã backup
          </Button>
        </div>
      </div>
    );
  }

  if (step === "disable-confirm") {
    return (
      <div className="space-y-3">
        <div className="text-sm">Nhập mật khẩu để xác nhận:</div>
        <Input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="Mật khẩu hiện tại"
          autoComplete="current-password"
        />
        {error && (
          <div className="text-sm text-destructive flex items-start gap-1.5">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setStep("idle")}>
            Hủy
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDisable}
            disabled={loading || !pw || required}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Tắt 2FA
          </Button>
          <Button size="sm" onClick={handleRegenerate} disabled={loading || !pw}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Sinh lại backup codes
          </Button>
        </div>
      </div>
    );
  }

  if (step === "setup-qr") {
    return (
      <div className="space-y-4">
        <ol className="list-decimal list-inside space-y-1 text-sm">
          <li>Cài app Authenticator (Google Authenticator / Microsoft Authenticator / Authy)</li>
          <li>Quét mã QR bên dưới (hoặc nhập secret thủ công)</li>
          <li>Nhập mã 6 chữ số hiện trên app để hoàn tất</li>
        </ol>
        {qrDataUrl && (
          <div className="flex flex-col items-center gap-3 p-4 bg-muted/30 rounded-md">
            <img src={qrDataUrl} alt="QR" className="border bg-white p-2 rounded" />
            <div className="text-xs text-muted-foreground">Hoặc nhập thủ công:</div>
            <code className="text-xs bg-white px-2 py-1 rounded border select-all">{secret}</code>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="code">Mã 6 chữ số từ app:</Label>
          <Input
            id="code"
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="000000"
            className="text-center text-xl tracking-widest font-mono"
            autoFocus
          />
        </div>
        {error && (
          <div className="text-sm text-destructive flex items-start gap-1.5">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setStep("idle")}>
            Hủy
          </Button>
          <Button size="sm" onClick={handleEnable} disabled={loading || code.length !== 6}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Kích hoạt 2FA
          </Button>
        </div>
      </div>
    );
  }

  if (step === "backup-codes" && backupCodes) {
    return (
      <div className="space-y-3">
        <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
          ✓ 2FA đã được kích hoạt. <strong>Đây là 8 mã backup duy nhất</strong> - hãy lưu lại NGAY
          (in ra hoặc cất file).
        </div>
        <div className="bg-muted/40 p-3 rounded-md font-mono text-sm grid grid-cols-2 gap-2">
          {backupCodes.map((c, i) => (
            <div key={i} className="bg-white px-2 py-1.5 rounded border select-all">
              {c}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copyBackup}>
            <Copy className="h-4 w-4" /> Copy
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setStep("idle");
              setBackupCodes(null);
              window.location.reload();
            }}
          >
            Tôi đã lưu mã backup
          </Button>
        </div>
      </div>
    );
  }

  // Idle, chưa bật
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <ShieldOff className="h-4 w-4" />
        <span>Chưa bật 2FA.</span>
      </div>
      {error && (
        <div className="text-sm text-destructive flex items-start gap-1.5">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <Button onClick={handleSetup} disabled={loading} size="sm">
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        <ShieldCheck className="h-4 w-4" /> Bắt đầu thiết lập 2FA
      </Button>
    </div>
  );
}
