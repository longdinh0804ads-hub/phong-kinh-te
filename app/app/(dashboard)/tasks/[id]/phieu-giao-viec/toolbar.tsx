"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Printer, Edit3, Download, FileText, Loader2, Save } from "lucide-react";
import { updateAssignmentSheet } from "@/actions/assignment-sheet";

interface SheetData {
  id: string;
  number: number;
  year: number;
  basisDocument: string | null;
  workContent: string | null;
  deliverable: string | null;
  assignmentNote: string | null;
  recipientChuTich: boolean;
  recipientPCT: boolean;
  recipientHDND: boolean;
  recipientCustom: string[];
  task: {
    title: string;
    deadline: Date | string;
    assignee?: { name: string } | null;
  };
}

export function SheetToolbar({
  sheet,
  canEdit,
}: {
  sheet: SheetData;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  const sheetLabel = `${String(sheet.number).padStart(2, "0")}/PGV-KT/${sheet.year}`;

  function handlePrint() {
    window.print();
  }

  async function handleDownloadPDF() {
    // Client-side print → save as PDF (browser native)
    // Đơn giản: dùng cùng window.print() - browser cho phép "Save as PDF"
    window.print();
  }

  async function handleDownloadDOCX() {
    const res = await fetch(`/api/assignment-sheet/${sheet.id}/docx`);
    if (!res.ok) {
      alert("Không tải được file DOCX");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PGV-${String(sheet.number).padStart(2, "0")}-${sheet.year}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={handlePrint}>
          <Printer className="h-4 w-4" /> In
        </Button>
        <Button variant="outline" size="sm" onClick={handleDownloadPDF}>
          <Download className="h-4 w-4" /> PDF
        </Button>
        <Button variant="outline" size="sm" onClick={handleDownloadDOCX}>
          <FileText className="h-4 w-4" /> DOCX
        </Button>
        {canEdit && (
          <Button size="sm" onClick={() => setEditing(true)}>
            <Edit3 className="h-4 w-4" /> Chỉnh sửa
          </Button>
        )}
      </div>

      {editing && (
        <EditSheetDialog
          sheet={sheet}
          sheetLabel={sheetLabel}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function EditSheetDialog({
  sheet,
  sheetLabel,
  onClose,
  onSaved,
}: {
  sheet: SheetData;
  sheetLabel: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [basis, setBasis] = useState(sheet.basisDocument || "");
  const [content, setContent] = useState(sheet.workContent || "");
  const [deliver, setDeliver] = useState(sheet.deliverable || "");
  const [note, setNote] = useState(sheet.assignmentNote || "");
  const [recChuTich, setRecChuTich] = useState(sheet.recipientChuTich);
  const [recPCT, setRecPCT] = useState(sheet.recipientPCT);
  const [recHDND, setRecHDND] = useState(sheet.recipientHDND);
  const [recCustom, setRecCustom] = useState(sheet.recipientCustom.join("\n"));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const r = await updateAssignmentSheet({
      sheetId: sheet.id,
      basisDocument: basis,
      workContent: content,
      deliverable: deliver,
      assignmentNote: note,
      recipientChuTich: recChuTich,
      recipientPCT: recPCT,
      recipientHDND: recHDND,
      recipientCustom: recCustom
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    });
    setSaving(false);
    if (r.ok) onSaved();
    else setError(r.error || "Lỗi cập nhật");
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Chỉnh phiếu {sheetLabel}</DialogTitle>
          <DialogDescription>
            Mọi thay đổi sẽ được lưu lại trong DB. Sau khi lưu, bạn có thể in/tải lại.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Mục 1 - Văn bản căn cứ</Label>
            <textarea
              value={basis}
              onChange={(e) => setBasis(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <Label>Mục 3 - Phân công chi tiết</Label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="VD: Đ/c X chỉ đạo; Đ/c Y phụ trách...; Đ/c Z phụ trách..."
            />
          </div>
          <div>
            <Label>Mục 4a - Nội dung cần thực hiện</Label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <Label>Mục 4b - Sản phẩm cần nộp</Label>
            <textarea
              value={deliver}
              onChange={(e) => setDeliver(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <Label>Nơi nhận (toggle)</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={recChuTich}
                  onChange={(e) => setRecChuTich(e.target.checked)}
                />
                Chủ tịch UBND xã
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={recPCT}
                  onChange={(e) => setRecPCT(e.target.checked)}
                />
                PCT UBND xã
              </label>
              <label className="flex items-center gap-2 text-sm col-span-2">
                <input
                  type="checkbox"
                  checked={recHDND}
                  onChange={(e) => setRecHDND(e.target.checked)}
                />
                Thường trực HĐND xã
              </label>
            </div>
          </div>

          <div>
            <Label>Nơi nhận khác (mỗi dòng 1 mục)</Label>
            <textarea
              value={recCustom}
              onChange={(e) => setRecCustom(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="VD: Đ/c Trần Tuấn Minh; Đoàn giám sát..."
            />
          </div>

          {error && <div className="text-sm text-destructive">{error}</div>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Hủy
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Lưu thay đổi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
