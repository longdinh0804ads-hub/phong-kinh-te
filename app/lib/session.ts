import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { db } from "./db";
import type { Role } from "@prisma/client";
import { hasPermission, type Permission } from "./permissions";

export async function getCurrentUser() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user) return null;

  const user = await db.user.findUnique({
    where: { id: session.user.id },
  });
  return user;
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isActive) redirect("/login?error=inactive");
  return user;
}

export async function requireRole(...allowed: Role[]) {
  const user = await requireAuth();
  if (!allowed.includes(user.role)) {
    redirect("/?error=forbidden");
  }
  return user;
}

export async function requirePermission(permission: Permission) {
  const user = await requireAuth();
  if (!hasPermission(user.role, permission)) {
    redirect("/?error=forbidden");
  }
  return user;
}
