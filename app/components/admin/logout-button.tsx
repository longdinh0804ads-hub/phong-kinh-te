"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function logout() {
    startTransition(async () => {
      try {
        await fetch("/api/auth/sign-out", {
          method: "POST",
          headers: { Origin: window.location.origin },
        });
      } catch {}
      router.push("/login");
    });
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={isPending}
      className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-slate-200 hover:bg-slate-800 transition-colors disabled:opacity-50"
    >
      <LogOut className="h-4 w-4 shrink-0" />
      Đăng xuất
    </button>
  );
}
