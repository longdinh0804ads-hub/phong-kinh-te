import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/session";
import { canUseAI } from "@/lib/permissions";
import { PageHeader } from "@/components/layout/page-header";
import { ChatInterface } from "@/components/ai/chat-interface";

export default async function AIPage() {
  const user = await requireAuth();
  if (!canUseAI(user.role)) redirect("/?error=forbidden");

  // Chat layout phải fit viewport, không scroll page outer.
  // Mobile: trừ thêm bottom-nav (~5rem).
  return (
    <div className="flex flex-col h-[calc(100dvh-10rem)] md:h-[calc(100dvh-6rem)] overflow-hidden">
      <div className="shrink-0">
        <PageHeader
          title="Trợ lý AI"
          description="Tra cứu nghị định, thông tư, quyết định để hỗ trợ giải đáp người dân"
        />
      </div>
      <div className="flex-1 min-h-0">
        <ChatInterface userId={user.id} userName={user.name} />
      </div>
    </div>
  );
}
