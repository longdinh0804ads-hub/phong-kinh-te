import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { TwoFAVerifyForm } from "./two-fa-form";

export default async function Login2FAPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || !session?.session?.id) {
    redirect("/login");
  }

  const dbSession = await db.session.findUnique({
    where: { id: session.session.id },
    select: { twoFactorVerified: true },
  });
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { twoFactorEnabled: true, name: true, email: true },
  });

  if (!user) redirect("/login");
  if (!user.twoFactorEnabled) {
    // User chưa enable 2FA → vào thẳng
    redirect(callbackUrl || "/");
  }
  if (dbSession?.twoFactorVerified) {
    // Đã verify rồi → vào thẳng
    redirect(callbackUrl || "/");
  }

  return <TwoFAVerifyForm userName={user.name} callbackUrl={callbackUrl || "/"} />;
}
