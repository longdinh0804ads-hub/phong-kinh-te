import Link from "next/link";
import { requireAuth } from "@/lib/session";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/filters/search-input";
import { LegalCard } from "@/components/legal/legal-card";
import { Plus, Library } from "lucide-react";
import { cn } from "@/lib/utils";

const DOC_TYPE_FILTERS = [
  { value: "ALL", label: "Tất cả" },
  { value: "NGHI_DINH", label: "Nghị định" },
  { value: "THONG_TU", label: "Thông tư" },
  { value: "QUYET_DINH", label: "Quyết định" },
  { value: "LUAT", label: "Luật" },
  { value: "NGHI_QUYET", label: "Nghị quyết" },
  { value: "CONG_VAN", label: "Công văn" },
];

export default async function LegalPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; type?: string }>;
}) {
  const user = await requireAuth();
  const params = await searchParams;
  const search = params.search?.trim() || "";
  const type = params.type && params.type !== "ALL" ? params.type : undefined;

  const canUpload = hasPermission(user.role, "legal:upload");
  const canDelete = hasPermission(user.role, "legal:manage");

  const where: any = {};
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { docNumber: { contains: search, mode: "insensitive" } },
      { summary: { contains: search, mode: "insensitive" } },
    ];
  }
  if (type) where.docType = type;

  const [docs, totalCount] = await Promise.all([
    db.legalDocument.findMany({
      where,
      orderBy: { effectiveDate: "desc" },
      include: { _count: { select: { chunks: true } } },
      take: 200,
    }),
    db.legalDocument.count(),
  ]);

  return (
    <div>
      <PageHeader
        title="Văn bản pháp lý"
        description={
          search || type
            ? `${docs.length} kết quả / ${totalCount} văn bản`
            : `${totalCount} văn bản trong hệ thống`
        }
        actions={
          canUpload && (
            <Link href="/legal/upload">
              <Button>
                <Plus className="h-4 w-4" />
                Thêm văn bản
              </Button>
            </Link>
          )
        }
      />

      {/* Search + filter loại văn bản */}
      <Card className="mb-4">
        <CardContent className="pt-4 pb-4 space-y-3">
          <SearchInput
            placeholder="Tìm theo tên văn bản, số hiệu hoặc tóm tắt..."
            paramName="search"
          />
          <div className="flex gap-1.5 flex-wrap">
            {DOC_TYPE_FILTERS.map((f) => {
              const active = (params.type || "ALL") === f.value;
              const params2 = new URLSearchParams();
              if (search) params2.set("search", search);
              if (f.value !== "ALL") params2.set("type", f.value);
              const href = `/legal${params2.toString() ? "?" + params2.toString() : ""}`;
              return (
                <Link
                  key={f.value}
                  href={href}
                  className={cn(
                    "px-3 py-1.5 text-sm rounded-md border transition-colors",
                    active
                      ? "bg-primary text-primary-foreground border-primary font-semibold"
                      : "hover:bg-accent border-input"
                  )}
                >
                  {f.label}
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Danh sách */}
      {docs.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Library className="h-12 w-12 mx-auto mb-3 opacity-30" />
            {search || type ? (
              <div>
                <p className="font-medium">Không tìm thấy văn bản nào khớp</p>
                <p className="text-sm mt-1">Thử đổi từ khóa hoặc loại văn bản</p>
              </div>
            ) : (
              <div>
                <p className="font-medium">Chưa có văn bản nào trong hệ thống</p>
                {canUpload && (
                  <p className="text-sm mt-1">Thêm văn bản để dùng cho Trợ lý AI.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {docs.map((d) => (
            <LegalCard
              key={d.id}
              doc={d}
              canDelete={canDelete}
              chunkCount={d._count.chunks}
            />
          ))}
        </div>
      )}
    </div>
  );
}
