"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";

const RETENTION_DAYS = 7;

// Throttle cleanup: chỉ chạy 1 lần mỗi giờ thay vì mỗi request (BUG-7 fix)
let lastCleanupRun = 0;
const CLEANUP_THROTTLE_MS = 60 * 60 * 1000; // 1 giờ

/**
 * Cleanup conversations cũ hơn 7 ngày, throttled.
 * Pinned conversations không bị xóa.
 */
async function cleanupOldConversations() {
  const now = Date.now();
  if (now - lastCleanupRun < CLEANUP_THROTTLE_MS) return; // skip nếu vừa chạy
  lastCleanupRun = now;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

  try {
    const result = await db.conversation.deleteMany({
      where: {
        updatedAt: { lt: cutoff },
        isPinned: false,
      },
    });
    if (result.count > 0) {
      console.log(`[conversation-cleanup] Đã xóa ${result.count} conversation cũ > ${RETENTION_DAYS} ngày`);
    }
  } catch (e: any) {
    console.error("[conversation-cleanup] Failed:", e?.message);
  }
}

/**
 * Lấy danh sách conversations của user (có cleanup tự động, throttled 1h).
 */
export async function getConversations() {
  const user = await requireAuth();

  // Throttled cleanup (max 1 lần/h dù bao nhiêu user gọi)
  await cleanupOldConversations();

  return db.conversation.findMany({
    where: { userId: user.id },
    orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
    take: 50,
    select: {
      id: true,
      title: true,
      isPinned: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
  });
}

/**
 * Lấy toàn bộ messages của 1 conversation (chỉ owner mới xem được).
 */
export async function getConversationMessages(conversationId: string) {
  const user = await requireAuth();

  // Cap 100 messages gần nhất để không tràn payload (RISK-6 fix)
  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, userId: user.id },
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 100,
      },
    },
  });

  if (!conversation) return null;
  // Reverse lại thành chronological order cho UI
  conversation.messages = conversation.messages.reverse();
  return conversation;
}

/**
 * Tạo conversation mới với title tự sinh từ câu hỏi đầu.
 */
export async function createConversation(firstQuestion: string) {
  const user = await requireAuth();

  const title =
    firstQuestion.length > 80 ? firstQuestion.slice(0, 77) + "..." : firstQuestion;

  const conversation = await db.conversation.create({
    data: {
      userId: user.id,
      title,
    },
  });

  return { id: conversation.id, title: conversation.title };
}

/**
 * Đổi tên conversation.
 */
export async function renameConversation(id: string, title: string) {
  const user = await requireAuth();

  const conversation = await db.conversation.findFirst({
    where: { id, userId: user.id },
  });
  if (!conversation) return { error: "Không tìm thấy hội thoại" };

  const trimmed = title.trim().slice(0, 200);
  if (trimmed.length < 1) return { error: "Tiêu đề không được để trống" };

  await db.conversation.update({
    where: { id },
    data: { title: trimmed },
  });

  revalidatePath("/ai");
  return { success: true };
}

/**
 * Ghim/bỏ ghim conversation - pinned không bị auto-cleanup.
 */
export async function togglePinConversation(id: string) {
  const user = await requireAuth();

  const conversation = await db.conversation.findFirst({
    where: { id, userId: user.id },
  });
  if (!conversation) return { error: "Không tìm thấy hội thoại" };

  await db.conversation.update({
    where: { id },
    data: { isPinned: !conversation.isPinned },
  });

  revalidatePath("/ai");
  return { success: true, isPinned: !conversation.isPinned };
}

/**
 * Xóa conversation và toàn bộ messages.
 */
export async function deleteConversation(id: string) {
  const user = await requireAuth();

  const conversation = await db.conversation.findFirst({
    where: { id, userId: user.id },
  });
  if (!conversation) return { error: "Không tìm thấy hội thoại" };

  await db.conversation.delete({ where: { id } });
  revalidatePath("/ai");
  return { success: true };
}

/**
 * Cập nhật updatedAt của conversation (gọi sau mỗi message để giữ thread "mới").
 * Chỉ chủ conversation mới được touch (M-5 fix: chống DoS qua bypass cleanup).
 */
export async function touchConversation(id: string) {
  const user = await requireAuth();
  await db.conversation.updateMany({
    where: { id, userId: user.id },
    data: { updatedAt: new Date() },
  });
}
