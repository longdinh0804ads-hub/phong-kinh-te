"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Key, Lock, Unlock, Loader2, Copy, CheckCheck } from "lucide-react";
import { resetUserPassword, setUserActive } from "@/actions/admin";

export function UserAdminActions({
  userId,
  userName,
  isActive,
  isSuperAdminTarget,
}: {
  userId: string;
  userName: string;
  isActive: boolean;
  isSuperAdminTarget: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [resetResult, setResetResult] = useState<{ newPassword: string } | null>(null);
  const [resetDialog, setResetDialog] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function handleReset() {
    if (!confirm(`Reset password cho "${userName}"? Password mới sẽ hiện ra để bạn gửi user.`)) return;
    setErr(null);
    startTransition(async () => {
      const r = await resetUserPassword(userId);
      if (r.success && r.newPassword) {
        setResetResult({ newPassword: r.newPassword });
        setResetDialog(true);
      } else {
        setErr(r.error || "Lỗi");
      }
    });
  }

  function handleToggleActive() {
    const action = isActive ? "Vô hiệu hóa" : "Kích hoạt";
    if (!confirm(`${action} tài khoản "${userName}"? ${isActive ? "Tất cả session sẽ bị revoke." : ""}`)) return;
    setErr(null);
    startTransition(async () => {
      const r = await setUserActive(userId, !isActive);
      if (r.success) router.refresh();
      else setErr(r.error || "Lỗi");
    });
  }

  function copyPassword() {
    if (!resetResult) return;
    navigator.clipboard.writeText(resetResult.newPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-wrap items-center gap-1 justify-end">
      <Button
        size="sm"
        variant="ghost"
        onClick={handleReset}
        disabled={isPending}
        className="h-8 px-2 text-xs"
        title="Reset password"
      >
        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Key className="h-3.5 w-3.5" />}
        Reset pw
      </Button>
      {!isSuperAdminTarget && (
        <Button
          size="sm"
          variant="ghost"
          onClick={handleToggleActive}
          disabled={isPending}
          className="h-8 px-2 text-xs"
          title={isActive ? "Vô hiệu hóa" : "Kích hoạt"}
        >
          {isActive ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          {isActive ? "Khóa" : "Mở khóa"}
        </Button>
      )}
      {err && (
        <div className="text-xs text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">
          {err}
        </div>
      )}

      <Dialog open={resetDialog} onOpenChange={setResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Password mới cho {userName}</DialogTitle>
            <DialogDescription>
              Sao chép password này và gửi cho user. Password chỉ hiện 1 lần.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted px-3 py-2 rounded-md font-mono text-sm break-all">
            {resetResult?.newPassword}
          </div>
          <DialogFooter>
            <Button onClick={copyPassword} variant="outline">
              {copied ? <CheckCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Đã copy" : "Copy"}
            </Button>
            <Button onClick={() => setResetDialog(false)}>Đóng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
