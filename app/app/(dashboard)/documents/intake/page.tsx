import { requireAuth } from "@/lib/session";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { isTopLeader, isDeptManager } from "@/lib/permissions";
import { EXCLUDE_SUPER_ADMIN } from "@/lib/user-filters";
import { PageHeader } from "@/components/layout/page-header";
import { DocumentIntakeClient } from "./client";

export default async function DocumentIntakePage() {
  const user = await requireAuth();
  if (
    !isTopLeader(user.role) &&
    !isDeptManager(user.role) &&
    user.role !== "SUPER_ADMIN"
  ) {
    redirect("/?error=forbidden");
  }

  const users = await db.user.findMany({
    where: { isActive: true, ...EXCLUDE_SUPER_ADMIN },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      position: true,
      department: true,
      fields: true,
    },
  });

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Tiếp nhận văn bản đến"
        description="Upload PDF/TXT để trợ lý AI tự phân loại, gợi ý phân công, tạo nhiệm vụ"
      />
      <DocumentIntakeClient users={users} />
    </div>
  );
}
