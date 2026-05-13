import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { requireAuth } from "@/lib/session";
import { db } from "@/lib/db";
import { isTopLeader } from "@/lib/permissions";
import { getSetting } from "@/lib/system-settings";
import { PGV_SETTINGS } from "@/lib/assignment-sheet";
import { AssignmentSheetView } from "@/components/assignment-sheet/sheet-view";
import { SheetToolbar } from "./toolbar";
import { ArrowLeft } from "lucide-react";

export default async function PhieuGiaoViecPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAuth();
  const { id } = await params;

  const sheet = await db.assignmentSheet.findFirst({
    where: { taskId: id },
    include: {
      task: {
        include: {
          assignee: { select: { id: true, name: true, position: true } },
          taskGroup: { select: { name: true } },
        },
      },
    },
  });

  if (!sheet) notFound();

  // Permission: TP/PTP, hoặc assignee/creator của task
  const isLeader = isTopLeader(user.role);
  const isAssignee = sheet.task.assignee?.id === user.id;
  // Task creator có thể xem (cần fetch creator)
  if (!isLeader && !isAssignee) {
    const task = await db.task.findUnique({
      where: { id },
      select: { creatorId: true },
    });
    if (!task || task.creatorId !== user.id) {
      redirect(`/tasks/${id}?error=forbidden`);
    }
  }

  const signatureUrl = await getSetting(PGV_SETTINGS.SIGNATURE_URL);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap no-print">
        <Link
          href={`/tasks/${id}`}
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-4 w-4" /> Quay lại nhiệm vụ
        </Link>
        <SheetToolbar sheet={sheet as any} canEdit={isLeader} />
      </div>

      {/* Sheet render */}
      <div className="pgv-print-wrapper bg-slate-100 p-4 rounded-md overflow-x-auto">
        <div className="shadow-lg mx-auto" style={{ width: "fit-content" }}>
          <AssignmentSheetView sheet={sheet as any} signatureUrl={signatureUrl} />
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          /* Hide everything except sheet */
          body * { visibility: hidden; }
          .pgv-print-wrapper, .pgv-print-wrapper * { visibility: visible; }
          .pgv-print-wrapper {
            position: absolute;
            left: 0; top: 0;
            background: white !important;
            padding: 0 !important;
          }
          .pgv-print-wrapper > div { box-shadow: none !important; }
          .no-print { display: none !important; }
          @page {
            size: A4;
            margin: 0;
          }
        }
      `}</style>
    </div>
  );
}
