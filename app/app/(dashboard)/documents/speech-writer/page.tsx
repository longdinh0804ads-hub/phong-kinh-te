import { requireAuth } from "@/lib/session";
import { redirect } from "next/navigation";
import { isTopLeader, isDeptManager } from "@/lib/permissions";
import { PageHeader } from "@/components/layout/page-header";
import { SpeechWriterClient } from "./client";

export default async function SpeechWriterPage() {
  const user = await requireAuth();
  if (
    !isTopLeader(user.role) &&
    !isDeptManager(user.role) &&
    user.role !== "SUPER_ADMIN"
  ) {
    redirect("/?error=forbidden");
  }

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Soạn bài phát biểu"
        description="Trợ lý AI viết bài phát biểu trang trọng dựa trên chủ đề + tự động dẫn chiếu văn bản pháp lý"
      />
      <SpeechWriterClient />
    </div>
  );
}
