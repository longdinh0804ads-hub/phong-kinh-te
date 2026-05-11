"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, User, Settings } from "lucide-react";
import { ROLE_LABELS } from "@/lib/permissions";
import type { Role } from "@prisma/client";
import { getInitials } from "@/lib/utils";
import { NotificationPopover } from "./notification-popover";

interface HeaderProps {
  user: { id: string; name: string; email: string; role: Role; position: string; image?: string | null };
  notificationCount?: number;
}

export function Header({ user, notificationCount = 0 }: HeaderProps) {
  const router = useRouter();

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 bg-card border-b h-16 flex items-center justify-between px-4 md:px-6">
      <div className="md:hidden flex items-center gap-2">
        <span className="font-bold text-base">PKT Trần Phú</span>
      </div>
      <div className="hidden md:block" />

      <div className="flex items-center gap-3">
        <NotificationPopover initialUnreadCount={notificationCount} />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="px-2 gap-2">
              <Avatar className="h-8 w-8">
                {user.image && <AvatarImage src={user.image} alt={user.name} />}
                <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
              </Avatar>
              <div className="hidden md:flex flex-col items-start text-xs">
                <span className="font-semibold">{user.name}</span>
                <span className="text-muted-foreground">{ROLE_LABELS[user.role]}</span>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>
              <div className="font-semibold">{user.name}</div>
              <div className="text-xs text-muted-foreground font-normal">{user.email}</div>
              <div className="text-xs text-muted-foreground font-normal mt-1">{user.position}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/profile">
                <User className="h-4 w-4" />
                Hồ sơ cá nhân
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings className="h-4 w-4" />
                Cài đặt
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
              <LogOut className="h-4 w-4" />
              Đăng xuất
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
