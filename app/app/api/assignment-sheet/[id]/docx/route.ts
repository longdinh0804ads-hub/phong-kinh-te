/**
 * Export Phiếu giao việc dạng DOCX (.docx).
 * TP/PTP có thể download để chỉnh sửa thêm và in/ký.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { isTopLeader } from "@/lib/permissions";
import {
  formatSheetNumber,
  formatVNDate,
  formatShortDate,
  buildRecipientList,
} from "@/lib/assignment-sheet";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  const { id: sheetId } = await ctx.params;

  const sheet = await db.assignmentSheet.findUnique({
    where: { id: sheetId },
    include: {
      task: {
        include: {
          assignee: { select: { id: true, name: true, position: true } },
          taskGroup: { select: { name: true } },
          creator: { select: { id: true } },
        },
      },
    },
  });
  if (!sheet) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Permission
  const isLeader = isTopLeader(user.role);
  const isAssignee = sheet.task.assignee?.id === user.id;
  const isCreator = sheet.task.creator.id === user.id;
  if (!isLeader && !isAssignee && !isCreator) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Dynamic import docx (heavy module, không bundle vào main)
  const docx = await import("docx");
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    AlignmentType,
    HeadingLevel,
    Table,
    TableRow,
    TableCell,
    WidthType,
    BorderStyle,
  } = docx;

  const recipients = buildRecipientList(sheet);
  const numberLabel = formatSheetNumber(sheet.number, sheet.year);

  // Helper tạo paragraph cố định font + size
  const para = (
    children: any[],
    opts?: { align?: any; bold?: boolean; size?: number; spacing?: any }
  ) =>
    new Paragraph({
      children,
      alignment: opts?.align,
      spacing: opts?.spacing,
    });

  const txt = (
    text: string,
    opts?: { bold?: boolean; italic?: boolean; underline?: boolean; size?: number }
  ) =>
    new TextRun({
      text,
      bold: opts?.bold,
      italics: opts?.italic,
      underline: opts?.underline ? {} : undefined,
      size: opts?.size ?? 26, // 13pt
      font: "Times New Roman",
    });

  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              para([txt("UBND XÃ TRẦN PHÚ", { bold: true })], { align: AlignmentType.CENTER }),
              para([txt("PHÒNG KINH TẾ", { bold: true })], { align: AlignmentType.CENTER }),
              para([txt(`SỐ: ${numberLabel}`)], { align: AlignmentType.CENTER }),
            ],
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              para([txt("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", { bold: true })], {
                align: AlignmentType.CENTER,
              }),
              para([txt("Độc lập - Tự do - Hạnh phúc", { bold: true, underline: true })], {
                align: AlignmentType.CENTER,
              }),
              para([txt(`Trần Phú, ${formatVNDate(sheet.issuedAt)}`, { italic: true })], {
                align: AlignmentType.CENTER,
              }),
            ],
          }),
        ],
      }),
    ],
  });

  // Footer "Nơi nhận" + signer
  const footerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              para([txt("Nơi nhận:", { bold: true, italic: true })]),
              ...recipients.map((r) => para([txt(`- ${r}`, { size: 22 })])),
            ],
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              para(
                [
                  txt((sheet.signerTitle || "Trưởng phòng").toUpperCase(), {
                    bold: true,
                  }),
                ],
                { align: AlignmentType.CENTER }
              ),
              para([txt("")], { align: AlignmentType.CENTER }),
              para([txt("")], { align: AlignmentType.CENTER }),
              para([txt("")], { align: AlignmentType.CENTER }),
              para([txt("")], { align: AlignmentType.CENTER }),
              para([txt(sheet.signerName || "Vũ Văn Tuấn", { bold: true })], {
                align: AlignmentType.CENTER,
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: "Times New Roman", size: 26 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 }, // 2cm
          },
        },
        children: [
          headerTable,
          para([txt("")]),
          para([txt("PHIẾU GIAO VIỆC", { bold: true, size: 32 })], {
            align: AlignmentType.CENTER,
          }),
          para([txt("")]),
          para([txt("NỘI DUNG CÔNG VIỆC ĐƯỢC GIAO:", { bold: true })]),
          para([txt("")]),
          // Mục 1
          para([txt("1. Tham mưu thực hiện Văn bản:", { bold: true })]),
          para([txt(sheet.basisDocument || "Theo chỉ đạo của Lãnh đạo Phòng Kinh tế.")]),
          // Mục 2
          para([
            txt("2. Cơ quan, đơn vị thực hiện:", { bold: true }),
            txt(" Phòng Kinh tế"),
          ]),
          // Mục 3
          para([
            txt("3. Cá nhân phụ trách:", { bold: true }),
            txt(" " + (sheet.assignmentNote || "(chưa phân công)")),
          ]),
          // Mục 4
          para([txt("4. Yêu cầu đối với công việc được giao:", { bold: true })]),
          para([
            txt("a. Nội dung cần thực hiện: ", { italic: true }),
            txt(sheet.workContent || sheet.task.title),
          ]),
          para([
            txt("b. Hình thức tổ chức thực hiện (sản phẩm): ", { italic: true }),
            txt(sheet.deliverable || sheet.task.description || sheet.task.title),
          ]),
          para([
            txt("c. Thời hạn hoàn thành công việc báo cáo Lãnh đạo Phòng: ", {
              italic: true,
            }),
            txt(`Xong trước ${formatShortDate(sheet.task.deadline)}.`, { bold: true }),
          ]),
          para([txt("")]),
          para([txt("")]),
          footerTable,
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);

  return new NextResponse(buffer as any, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="PGV-${String(sheet.number).padStart(2, "0")}-${sheet.year}.docx"`,
    },
  });
}
