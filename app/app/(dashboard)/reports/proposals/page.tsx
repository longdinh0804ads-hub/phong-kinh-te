import { requireAuth } from "@/lib/session";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { isTopLeader } from "@/lib/permissions";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { ArrowLeft, Sparkles, CheckCircle2, XCircle, Clock, Inbox } from "lucide-react";
import { ProposalActions } from "./proposal-actions";

const STATUS_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "Chờ duyệt", color: "bg-amber-100 text-amber-800", icon: Clock },
  approved: { label: "Đã duyệt", color: "bg-emerald-100 text-emerald-800", icon: CheckCircle2 },
  rejected: { label: "Đã từ chối", color: "bg-slate-100 text-slate-700", icon: XCircle },
  expired: { label: "Hết hạn", color: "bg-gray-100 text-gray-500", icon: XCircle },
};

const FLAG_LABELS: Record<string, string> = {
  HIGH_OVERDUE: "Nhiều việc quá hạn",
  LOW_COMPLETION: "Tỷ lệ hoàn thành thấp",
  LOW_REPORTING: "Ít báo cáo tiến độ",
};

export default async function ProposalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requireAuth();
  if (!isTopLeader(user.role)) {
    redirect("/?error=forbidden");
  }

  const { status } = await searchParams;
  const filterStatus = status || "pending";

  const proposals = await db.aIProposal.findMany({
    where: filterStatus === "all" ? {} : { status: filterStatus },
    include: {
      targetUser: { select: { id: true, name: true, position: true, department: true } },
      reviewedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Count by status
  const counts = await db.aIProposal.groupBy({
    by: ["status"],
    _count: true,
  });
  const countMap: Record<string, number> = {};
  counts.forEach((c) => (countMap[c.status] = c._count));

  return (
    <div className="max-w-5xl">
      <Link
        href="/reports"
        className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Báo cáo
      </Link>
      <PageHeader
        title="Đề xuất nhắc nhở cán bộ"
        description="AI phân tích hiệu quả công việc và đề xuất nhắc nhở. TP duyệt trước khi gửi cán bộ."
      />

      {/* Filter tabs */}
      <Card className="mb-4">
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-2 flex-wrap">
            {[
              { v: "pending", label: "Chờ duyệt" },
              { v: "approved", label: "Đã duyệt" },
              { v: "rejected", label: "Đã từ chối" },
              { v: "expired", label: "Hết hạn" },
              { v: "all", label: "Tất cả" },
            ].map((tab) => {
              const active = filterStatus === tab.v;
              const count = tab.v === "all"
                ? Object.values(countMap).reduce((s, n) => s + n, 0)
                : countMap[tab.v] || 0;
              return (
                <Link
                  key={tab.v}
                  href={`/reports/proposals?status=${tab.v}`}
                  className={
                    "px-3 py-1.5 text-sm rounded-md border inline-flex items-center gap-2 transition-colors " +
                    (active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "hover:bg-accent border-input")
                  }
                >
                  {tab.label}
                  <span
                    className={
                      "px-1.5 py-0.5 text-xs rounded-full " +
                      (active ? "bg-primary-foreground/20" : "bg-muted")
                    }
                  >
                    {count}
                  </span>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* List */}
      {proposals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <Inbox className="h-12 w-12 mx-auto mb-3 opacity-40" />
            Không có đề xuất nào ở trạng thái "{STATUS_LABELS[filterStatus]?.label || filterStatus}".
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {proposals.map((p) => {
            const evidence = p.evidence as any;
            const metrics = evidence?.metrics || {};
            const flags: string[] = evidence?.flags || [];
            const statusMeta = STATUS_LABELS[p.status] || STATUS_LABELS.pending;
            const StatusIcon = statusMeta.icon;
            return (
              <Card key={p.id}>
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Sparkles className="h-4 w-4 text-primary shrink-0" />
                        <span className="font-semibold">{p.targetUser.name}</span>
                        <span className="text-sm text-muted-foreground">
                          ({p.targetUser.position})
                        </span>
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded ${statusMeta.color}`}>
                          <StatusIcon className="h-3 w-3" />
                          {statusMeta.label}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Đề xuất ngày {new Date(p.createdAt).toLocaleString("vi-VN")}
                        {p.reviewedAt && (
                          <>
                            {" · "}
                            <span>
                              Duyệt bởi {p.reviewedBy?.name} lúc{" "}
                              {new Date(p.reviewedAt).toLocaleString("vi-VN")}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Flags + Metrics */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs mb-3">
                    {flags.map((f) => (
                      <div
                        key={f}
                        className="bg-amber-50 border border-amber-200 rounded px-2 py-1 text-amber-800"
                      >
                        ⚠ {FLAG_LABELS[f] || f}
                      </div>
                    ))}
                  </div>

                  <details className="text-sm mb-3">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      Xem số liệu chi tiết
                    </summary>
                    <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2 text-xs bg-muted/30 rounded p-2">
                      <div>
                        <div className="text-muted-foreground">Task được giao 30d</div>
                        <div className="font-medium">{metrics.totalAssigned ?? "-"}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Đã hoàn thành</div>
                        <div className="font-medium">{metrics.completed ?? "-"}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Đang quá hạn</div>
                        <div className="font-medium text-red-700">{metrics.overdueOpen ?? "-"}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Đang xử lý</div>
                        <div className="font-medium">{metrics.inProgress ?? "-"}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Tỷ lệ hoàn thành</div>
                        <div className="font-medium">
                          {metrics.completionRate != null
                            ? Math.round(metrics.completionRate * 100) + "%"
                            : "-"}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Báo cáo/tuần</div>
                        <div className="font-medium">{metrics.reportsPerWeek ?? "-"}</div>
                      </div>
                    </div>
                  </details>

                  {/* Note */}
                  <div className="bg-muted/40 rounded p-3 text-sm whitespace-pre-wrap leading-relaxed mb-3">
                    {p.status === "approved" && p.finalNote ? p.finalNote : p.proposedNote}
                  </div>

                  {p.status === "pending" ? (
                    <ProposalActions proposalId={p.id} initialNote={p.proposedNote} />
                  ) : p.status === "rejected" && p.finalNote ? (
                    <div className="text-xs italic text-muted-foreground">
                      Lý do từ chối: {p.finalNote}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
