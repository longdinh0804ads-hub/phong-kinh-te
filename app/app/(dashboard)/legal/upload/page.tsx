import { requirePermission } from "@/lib/session";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { LegalUploadForm } from "@/components/legal/legal-upload-form";

export default async function LegalUploadPage() {
  await requirePermission("legal:upload");
  return (
    <div className="max-w-3xl">
      <PageHeader title="Thêm văn bản pháp lý" description="Upload nghị định, thông tư, quyết định để hệ thống AI có thể tra cứu" />
      <Card>
        <CardContent className="pt-6">
          <LegalUploadForm />
        </CardContent>
      </Card>
    </div>
  );
}
