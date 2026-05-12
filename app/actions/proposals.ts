"use server";

/**
 * Server actions cho AIProposal (Phase C):
 *   - approveProposal: TP duyệt + có thể edit note → tự tạo Notification cho cán bộ
 *   - rejectProposal: TP từ chối + lý do
 */
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { isTopLeader } from "@/lib/permissions";

interface ApproveInput {
  proposalId: string;
  /** Note đã edit (override AI text). Nếu trống → dùng proposedNote gốc */
  finalNote?: string;
  reviewComment?: string;
}

interface RejectInput {
  proposalId: string;
  reason: string;
}

export async function approveProposal(input: ApproveInput): Promise<{
  ok: boolean;
  error?: string;
}> {
  const user = await requireAuth();
  if (!isTopLeader(user.role)) {
    return { ok: false, error: "Chỉ TP/PTP được duyệt đề xuất" };
  }

  const proposal = await db.aIProposal.findUnique({
    where: { id: input.proposalId },
    include: { targetUser: { select: { id: true, name: true } } },
  });
  if (!proposal) return { ok: false, error: "Đề xuất không tồn tại" };
  if (proposal.status !== "pending") {
    return { ok: false, error: `Đề xuất đã ${proposal.status}, không thể duyệt lại` };
  }
  if (proposal.expiresAt < new Date()) {
    return { ok: false, error: "Đề xuất đã hết hạn" };
  }

  const finalNote = input.finalNote?.trim() || proposal.proposedNote;

  await db.$transaction([
    db.aIProposal.update({
      where: { id: proposal.id },
      data: {
        status: "approved",
        reviewedById: user.id,
        reviewedAt: new Date(),
        finalNote,
      },
    }),
    // Tạo notification cho cán bộ với nội dung TP duyệt
    db.notification.create({
      data: {
        userId: proposal.targetUserId,
        type: "REMINDER_DELIVERED",
        title: `Nhắc nhở từ Lãnh đạo phòng`,
        message: finalNote +
          (input.reviewComment ? `\n\n---\nGhi chú từ ${user.name}: ${input.reviewComment}` : ""),
        link: `/tasks?status=OVERDUE`,
      },
    }),
  ]);

  revalidatePath("/reports/proposals");
  return { ok: true };
}

export async function rejectProposal(input: RejectInput): Promise<{
  ok: boolean;
  error?: string;
}> {
  const user = await requireAuth();
  if (!isTopLeader(user.role)) {
    return { ok: false, error: "Chỉ TP/PTP được từ chối đề xuất" };
  }

  const proposal = await db.aIProposal.findUnique({ where: { id: input.proposalId } });
  if (!proposal) return { ok: false, error: "Đề xuất không tồn tại" };
  if (proposal.status !== "pending") {
    return { ok: false, error: `Đề xuất đã ${proposal.status}` };
  }

  await db.aIProposal.update({
    where: { id: proposal.id },
    data: {
      status: "rejected",
      reviewedById: user.id,
      reviewedAt: new Date(),
      finalNote: input.reason || "Lãnh đạo từ chối đề xuất nhắc nhở",
    },
  });

  revalidatePath("/reports/proposals");
  return { ok: true };
}
