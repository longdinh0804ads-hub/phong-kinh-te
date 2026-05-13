/**
 * Render Phiếu giao việc đúng mẫu hành chính Phòng Kinh Tế.
 * Server component - dùng cho cả on-screen + print.
 */
import { formatSheetNumber, formatVNDate, formatShortDate, buildRecipientList } from "@/lib/assignment-sheet";

interface SheetWithTask {
  id: string;
  number: number;
  year: number;
  issuedAt: Date;
  basisDocument: string | null;
  workContent: string | null;
  deliverable: string | null;
  assignmentNote: string | null;
  recipientChuTich: boolean;
  recipientPCT: boolean;
  recipientHDND: boolean;
  recipientCustom: string[];
  signerName: string | null;
  signerTitle: string | null;
  task: {
    id: string;
    title: string;
    deadline: Date;
    description: string | null;
    assignee: { name: string; position: string } | null;
    taskGroup: { name: string } | null;
  };
}

export function AssignmentSheetView({
  sheet,
  signatureUrl,
}: {
  sheet: SheetWithTask;
  signatureUrl?: string | null;
}) {
  const recipients = buildRecipientList(sheet);
  const numberLabel = formatSheetNumber(sheet.number, sheet.year);

  return (
    <div className="pgv-sheet bg-white text-black mx-auto" style={{ width: "210mm", minHeight: "297mm", padding: "20mm 20mm" }}>
      {/* Header */}
      <table className="w-full text-sm mb-6">
        <tbody>
          <tr>
            <td className="w-1/2 text-center align-top">
              <div className="font-bold uppercase">UBND XÃ TRẦN PHÚ</div>
              <div className="font-bold uppercase">PHÒNG KINH TẾ</div>
              <div className="w-16 mx-auto border-t border-black my-1"></div>
              <div>SỐ: {numberLabel}</div>
            </td>
            <td className="w-1/2 text-center align-top">
              <div className="font-bold uppercase">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
              <div className="font-bold underline">Độc lập - Tự do - Hạnh phúc</div>
              <div className="w-32 mx-auto border-t border-black my-1"></div>
              <div className="italic">Trần Phú, {formatVNDate(sheet.issuedAt)}</div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Title */}
      <h1 className="text-center text-xl font-bold uppercase tracking-wider mb-6">
        PHIẾU GIAO VIỆC
      </h1>

      {/* Body */}
      <div className="space-y-3 text-[15px] leading-relaxed" style={{ fontFamily: "'Times New Roman', serif" }}>
        <div className="font-bold">NỘI DUNG CÔNG VIỆC ĐƯỢC GIAO:</div>

        {/* 1 */}
        <div>
          <div>
            <strong>1. Tham mưu thực hiện Văn bản:</strong>
          </div>
          <div className="ml-0 mt-1 text-justify">
            {sheet.basisDocument || "Theo chỉ đạo của Lãnh đạo Phòng Kinh tế."}
          </div>
        </div>

        {/* 2 */}
        <div>
          <strong>2. Cơ quan, đơn vị thực hiện:</strong> Phòng Kinh tế
        </div>

        {/* 3 */}
        <div>
          <div>
            <strong>3. Cá nhân phụ trách:</strong> {sheet.assignmentNote}
          </div>
        </div>

        {/* 4 */}
        <div>
          <div>
            <strong>4. Yêu cầu đối với công việc được giao:</strong>
          </div>
          <div className="ml-0 mt-1 space-y-1">
            <div>
              <em>a. Nội dung cần thực hiện:</em> {sheet.workContent || sheet.task.title}
            </div>
            <div>
              <em>b. Hình thức tổ chức thực hiện (sản phẩm):</em>{" "}
              {sheet.deliverable || sheet.task.description || sheet.task.title}
            </div>
            <div>
              <em>c. Thời hạn hoàn thành công việc báo cáo Lãnh đạo Phòng:</em>{" "}
              <strong>Xong trước {formatShortDate(sheet.task.deadline)}.</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <table className="w-full mt-12 text-sm">
        <tbody>
          <tr>
            <td className="w-1/2 align-top">
              <div className="font-bold italic">Nơi nhận:</div>
              <ul className="ml-2 mt-1 text-[13px] leading-relaxed">
                {recipients.map((r, i) => (
                  <li key={i}>- {r}</li>
                ))}
              </ul>
            </td>
            <td className="w-1/2 align-top text-center">
              <div className="font-bold uppercase mb-2">
                {(sheet.signerTitle || "Trưởng phòng").toUpperCase()}
              </div>
              {signatureUrl ? (
                <div className="my-2 flex justify-center" style={{ minHeight: "80px" }}>
                  <img
                    src={signatureUrl}
                    alt="Chữ ký"
                    style={{ maxHeight: "100px", maxWidth: "200px", objectFit: "contain" }}
                  />
                </div>
              ) : (
                <div className="my-12"></div>
              )}
              <div className="font-bold">{sheet.signerName || "Vũ Văn Tuấn"}</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
