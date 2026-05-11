import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ForceChangePasswordForm } from "./form";

export default async function ChangePasswordRequiredPage({
  searchParams,
}: {
  searchParams: Promise<{ required?: string }>;
}) {
  const { required } = await searchParams;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { mustChangePassword: true, email: true, name: true },
  });

  if (!user) redirect("/login");
  if (!user.mustChangePassword && !required) {
    // Trang này chỉ dành cho user bị mustChange. Nếu không, redirect về settings.
    redirect("/settings");
  }

  return <ForceChangePasswordForm userName={user.name} email={user.email} />;
}
