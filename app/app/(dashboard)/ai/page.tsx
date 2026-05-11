import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/session";
import { canUseAI } from "@/lib/permissions";
import { PageHeader } from "@/components/layout/page-header";
import { ChatInterface } from "@/components/ai/chat-interface";

export default async function AIPage() {
  const user = await requireAuth();
  if (!canUseAI(user.role)) redirect("/?error=forbidden");

  return (
    <div>
      <PageHeader
        title="Trợ lý AI"
        description="Tra cứu nghị định, thông tư, quyết định để hỗ trợ giải đáp người dân"
      />
      <ChatInterface userId={user.id} userName={user.name} />
    </div>
  );
}
