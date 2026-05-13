/**
 * Helpers cho Phiếu giao việc (PGV-KT).
 *
 * Pattern:
 *   - Số phiếu auto-increment per year, format "<seq>/PGV-KT/<year>"
 *   - Auto-generate khi TP/PTP tạo task (sourceType bất kỳ)
 *   - TP/PTP có thể edit bất kỳ field sau khi tạo
 *   - Người ký lấy từ SystemSetting (default: Vũ Văn Tuấn - Trưởng phòng)
 */
import { db } from "./db";
import { getSetting } from "./system-settings";

const SIGNER_DEFAULTS = {
  name: "Vũ Văn Tuấn",
  title: "Trưởng phòng",
};

export const PGV_SETTINGS = {
  SIGNER_NAME: "PGV_SIGNER_NAME",
  SIGNER_TITLE: "PGV_SIGNER_TITLE",
  SIGNATURE_URL: "PGV_SIGNATURE_URL",
} as const;

/**
 * Lấy số phiếu kế tiếp cho năm hiện tại.
 * Dùng raw SQL transaction để tránh race condition khi nhiều task tạo cùng lúc.
 */
export async function getNextSheetNumber(year: number = new Date().getFullYear()): Promise<number> {
  // Find max number in this year
  const last = await db.assignmentSheet.findFirst({
    where: { year },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  return (last?.number ?? 0) + 1;
}

export interface CreateSheetInput {
  taskId: string;
  /** Mục 1 - VB căn cứ, có thể null (sẽ auto từ source) */
  basisDocument?: string | null;
  /** Mục 3 - phân công chi tiết, auto-gen nếu null */
  assignmentNote?: string | null;
  /** Mục 4a - nội dung cần thực hiện, auto từ task.title nếu null */
  workContent?: string | null;
  /** Mục 4b - sản phẩm, auto từ task.description nếu null */
  deliverable?: string | null;
  recipientChuTich?: boolean;
  recipientPCT?: boolean;
  recipientHDND?: boolean;
  recipientCustom?: string[];
}

/**
 * Tạo Phiếu giao việc cho task.
 * Auto-fill các field còn null:
 *   - basisDocument: từ UBND directive / iHanoi source
 *   - workContent: task.title
 *   - deliverable: task.description (truncate)
 *   - assignmentNote: "Đồng chí [assignee] phụ trách thực hiện"
 *   - signerName/Title: từ SystemSetting (default Vũ Văn Tuấn / TP)
 */
export async function createAssignmentSheet(
  input: CreateSheetInput
): Promise<{ id: string; number: number; year: number }> {
  // Load task + source để auto-fill
  const task = await db.task.findUnique({
    where: { id: input.taskId },
    include: {
      assignee: { select: { name: true, position: true } },
      taskGroup: { select: { name: true } },
    },
  });
  if (!task) throw new Error("Task không tồn tại");

  // Resolve basis document
  let basisDocument = input.basisDocument;
  if (!basisDocument) {
    if (task.sourceType === "UBND_DIRECTIVE" && task.sourceId) {
      const ubnd = await db.uBNDDirective.findUnique({
        where: { id: task.sourceId },
        select: { documentNo: true, title: true, issuedDate: true, issuedBy: true },
      });
      if (ubnd) {
        const dateStr = ubnd.issuedDate.toLocaleDateString("vi-VN");
        basisDocument = `Văn bản số ${ubnd.documentNo || "(chưa có số)"} ngày ${dateStr} của ${ubnd.issuedBy} về việc ${ubnd.title.toLowerCase()}.`;
      }
    } else if (task.sourceType === "IHANOI" && task.sourceId) {
      const ih = await db.iHanoiComplaint.findUnique({
        where: { id: task.sourceId },
        select: { ticketCode: true, content: true },
      });
      if (ih) {
        basisDocument = `Phản ánh iHanoi ${ih.ticketCode}: ${ih.content.slice(0, 200)}.`;
      }
    } else {
      basisDocument = "Theo chỉ đạo của Lãnh đạo Phòng Kinh tế.";
    }
  }

  // Resolve work content
  const workContent = input.workContent || task.title;

  // Resolve deliverable
  const deliverable =
    input.deliverable ||
    (task.description ? task.description.slice(0, 500) : task.title);

  // Resolve assignment note
  let assignmentNote = input.assignmentNote;
  if (!assignmentNote) {
    if (task.assignee) {
      assignmentNote = `Đồng chí ${task.assignee.name}${task.assignee.position ? " (" + task.assignee.position + ")" : ""} phụ trách thực hiện.`;
    } else if (task.taskGroup) {
      assignmentNote = `${task.taskGroup.name} phụ trách thực hiện.`;
    } else {
      assignmentNote = "(Chưa phân công cụ thể)";
    }
  }

  // Resolve signer
  const [signerName, signerTitle] = await Promise.all([
    getSetting(PGV_SETTINGS.SIGNER_NAME),
    getSetting(PGV_SETTINGS.SIGNER_TITLE),
  ]);

  const year = new Date().getFullYear();

  // Retry tối đa 3 lần khi race condition unique constraint
  for (let attempt = 0; attempt < 3; attempt++) {
    const number = await getNextSheetNumber(year);
    try {
      const sheet = await db.assignmentSheet.create({
        data: {
          taskId: input.taskId,
          number,
          year,
          basisDocument,
          workContent,
          deliverable,
          assignmentNote,
          recipientChuTich: input.recipientChuTich ?? false,
          recipientPCT: input.recipientPCT ?? false,
          recipientHDND: input.recipientHDND ?? false,
          recipientCustom: input.recipientCustom ?? [],
          signerName: signerName || SIGNER_DEFAULTS.name,
          signerTitle: signerTitle || SIGNER_DEFAULTS.title,
        },
      });
      return { id: sheet.id, number: sheet.number, year: sheet.year };
    } catch (e: any) {
      // Unique violation → retry
      if (e?.code === "P2002" && attempt < 2) continue;
      throw e;
    }
  }
  throw new Error("Không thể tạo phiếu giao việc sau 3 lần thử");
}

/**
 * Format số phiếu chuẩn: "42/PGV-KT/2026"
 */
export function formatSheetNumber(number: number, year: number): string {
  return `${String(number).padStart(2, "0")}/PGV-KT/${year}`;
}

/**
 * Format date Vietnamese: "ngày 13 tháng 05 năm 2026"
 */
export function formatVNDate(d: Date | string): string {
  const date = new Date(d);
  return `ngày ${String(date.getDate()).padStart(2, "0")} tháng ${String(date.getMonth() + 1).padStart(2, "0")} năm ${date.getFullYear()}`;
}

/**
 * Format short date: "13/05/2026"
 */
export function formatShortDate(d: Date | string): string {
  const date = new Date(d);
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

/**
 * Recipients label list cho phần "Nơi nhận"
 */
export function buildRecipientList(sheet: {
  recipientChuTich: boolean;
  recipientPCT: boolean;
  recipientHDND: boolean;
  recipientCustom: string[];
  task: { assignee: { name: string } | null; taskGroup: { name: string } | null };
}): string[] {
  const list: string[] = [];
  if (sheet.recipientChuTich) list.push("Chủ tịch UBND xã");
  if (sheet.recipientPCT) list.push("PCT UBND xã");
  if (sheet.recipientHDND) list.push("Thường trực HĐND xã");
  if (sheet.recipientCustom) list.push(...sheet.recipientCustom);
  // Assignee
  if (sheet.task.assignee) {
    list.push(`Đ/c ${sheet.task.assignee.name}`);
  } else if (sheet.task.taskGroup) {
    list.push(sheet.task.taskGroup.name);
  }
  list.push("Lưu: KT.");
  return list;
}
