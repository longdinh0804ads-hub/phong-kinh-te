"use client";

import { useState } from "react";
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
import { FileSpreadsheet, Download, Loader2, Printer } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { STATUS_LABELS, PRIORITY_LABELS } from "@/components/task/status-badge";

export interface TaskReportRow {
  /** Số hiệu VB - lấy từ sourceType + sourceId hoặc auto sinh */
  documentNo: string;
  /** Tên Văn bản - title của task */
  taskTitle: string;
  /** Đơn vị ban hành - dept của người giao */
  issuingDept: string;
  /** Ngày ban hành - createdAt */
  issuedDate: string;
  /** Thời hạn - deadline */
  deadline: string;
  /** Phòng/Ban thực hiện - dept của người nhận */
  assigneeDept: string;
  /** Nội dung - description hoặc summary */
  content: string;
  /** Tình trạng xử lý - status + ghi chú thêm */
  status: string;
  /** Người đảm nhận - name + position */
  assigneeInfo: string;
}

interface Props {
  rows: TaskReportRow[];
  /** Số tổng task hiện đang được filter */
  totalFiltered: number;
}

export function TaskReportWizard({ rows, totalFiltered }: Props) {
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [reportTitle, setReportTitle] = useState(
    `Báo cáo công việc - ${new Date().toLocaleDateString("vi-VN")}`
  );
  const [reportPeriod, setReportPeriod] = useState("");
  const [includeStats, setIncludeStats] = useState(true);

  function exportExcel() {
    setGenerating(true);
    try {
      // Tạo HTML table → blob "application/vnd.ms-excel"
      // Excel chấp nhận HTML table → có format đẹp, không cần lib xlsx
      const html = buildHTMLTable(rows, reportTitle, reportPeriod, includeStats);
      const blob = new Blob(["﻿" + html], {
        type: "application/vnd.ms-excel;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slugify(reportTitle)}.xls`;
      a.click();
      URL.revokeObjectURL(url);
      setOpen(false);
    } finally {
      setGenerating(false);
    }
  }

  function printReport() {
    const html = buildHTMLTable(rows, reportTitle, reportPeriod, includeStats);
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} className="no-print">
        <FileSpreadsheet className="h-4 w-4" /> Tạo báo cáo
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" /> Tạo báo cáo công việc
            </DialogTitle>
            <DialogDescription>
              Sinh báo cáo dạng bảng theo mẫu hành chính với {totalFiltered} nhiệm vụ đang lọc.
              Có thể xuất Excel hoặc in trực tiếp.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Tiêu đề báo cáo</Label>
              <Input
                value={reportTitle}
                onChange={(e) => setReportTitle(e.target.value)}
                placeholder="VD: Báo cáo công việc tháng 5/2026"
              />
            </div>

            <div>
              <Label>Kỳ báo cáo (tùy chọn)</Label>
              <Input
                value={reportPeriod}
                onChange={(e) => setReportPeriod(e.target.value)}
                placeholder="VD: Từ 01/05/2026 đến 31/05/2026"
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeStats}
                onChange={(e) => setIncludeStats(e.target.checked)}
                className="rounded"
              />
              <span>Kèm thống kê tổng quan ở đầu báo cáo (số nhiệm vụ theo trạng thái/ưu tiên)</span>
            </label>

            {/* Preview */}
            <div className="bg-muted/30 p-3 rounded-md text-xs space-y-1">
              <div className="font-medium">Báo cáo sẽ bao gồm 10 cột:</div>
              <ol className="list-decimal list-inside text-muted-foreground grid grid-cols-2 gap-x-4">
                <li>STT</li>
                <li>Số hiệu VB</li>
                <li>Tên Văn bản</li>
                <li>Đơn vị ban hành</li>
                <li>Ngày ban hành</li>
                <li>Thời hạn</li>
                <li>Phòng/Ban thực hiện</li>
                <li>Nội dung</li>
                <li>Tình trạng xử lý</li>
                <li>Thông tin người đảm nhận</li>
              </ol>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={generating}>
              Hủy
            </Button>
            <Button variant="outline" onClick={printReport} disabled={generating}>
              <Printer className="h-4 w-4" /> Xem & In
            </Button>
            <Button onClick={exportExcel} disabled={generating || rows.length === 0}>
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Tải Excel (.xls)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// =================== HTML BUILDER ===================

function buildHTMLTable(
  rows: TaskReportRow[],
  title: string,
  period: string,
  includeStats: boolean
): string {
  // Compute stats
  let statsHTML = "";
  if (includeStats) {
    const byStatus = new Map<string, number>();
    const byPriority = new Map<string, number>();
    for (const r of rows) {
      byStatus.set(r.status, (byStatus.get(r.status) || 0) + 1);
    }
    statsHTML = `
      <table style="border-collapse:collapse;margin:8px 0;font-size:13px;">
        <tr>
          <td style="padding:4px 12px;font-weight:bold;border:1px solid #999;background:#f0f0f0;">Tổng nhiệm vụ</td>
          <td style="padding:4px 12px;border:1px solid #999;">${rows.length}</td>
        </tr>
        ${Array.from(byStatus.entries())
          .map(
            ([s, n]) =>
              `<tr><td style="padding:4px 12px;border:1px solid #999;background:#fafafa;">${escape(s)}</td><td style="padding:4px 12px;border:1px solid #999;">${n}</td></tr>`
          )
          .join("")}
      </table>
    `;
  }

  const rowsHTML = rows
    .map(
      (r, i) => `
    <tr>
      <td style="border:1px solid #444;padding:4px;text-align:center;">${i + 1}</td>
      <td style="border:1px solid #444;padding:4px;">${escape(r.documentNo)}</td>
      <td style="border:1px solid #444;padding:4px;">${escape(r.taskTitle)}</td>
      <td style="border:1px solid #444;padding:4px;">${escape(r.issuingDept)}</td>
      <td style="border:1px solid #444;padding:4px;text-align:center;">${escape(r.issuedDate)}</td>
      <td style="border:1px solid #444;padding:4px;text-align:center;">${escape(r.deadline)}</td>
      <td style="border:1px solid #444;padding:4px;">${escape(r.assigneeDept)}</td>
      <td style="border:1px solid #444;padding:4px;">${escape(r.content)}</td>
      <td style="border:1px solid #444;padding:4px;">${escape(r.status)}</td>
      <td style="border:1px solid #444;padding:4px;">${escape(r.assigneeInfo)}</td>
    </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escape(title)}</title></head>
<body style="font-family:'Times New Roman',serif;padding:20px;color:#000;">
  <div style="text-align:center;margin-bottom:16px;">
    <div style="text-transform:uppercase;font-weight:bold;font-size:13px;">UBND XÃ TRẦN PHÚ</div>
    <div style="text-transform:uppercase;font-weight:bold;font-size:14px;">PHÒNG KINH TẾ</div>
    <div style="border-top:1px solid #000;width:80px;margin:8px auto;"></div>
    <h1 style="font-size:18px;margin:8px 0;text-transform:uppercase;">${escape(title)}</h1>
    ${period ? `<div style="font-size:13px;font-style:italic;">${escape(period)}</div>` : ""}
  </div>

  ${statsHTML}

  <table style="border-collapse:collapse;width:100%;font-size:12px;">
    <thead>
      <tr style="background:#d9e2f3;font-weight:bold;">
        <th style="border:1px solid #444;padding:6px;width:30px;">#</th>
        <th style="border:1px solid #444;padding:6px;width:90px;">Số hiệu VB</th>
        <th style="border:1px solid #444;padding:6px;">Tên Văn bản</th>
        <th style="border:1px solid #444;padding:6px;width:110px;">Đơn vị ban hành</th>
        <th style="border:1px solid #444;padding:6px;width:80px;">Ngày ban hành</th>
        <th style="border:1px solid #444;padding:6px;width:80px;">Thời hạn</th>
        <th style="border:1px solid #444;padding:6px;width:110px;">Phòng/Ban thực hiện</th>
        <th style="border:1px solid #444;padding:6px;">Nội dung</th>
        <th style="border:1px solid #444;padding:6px;width:100px;">Tình trạng xử lý</th>
        <th style="border:1px solid #444;padding:6px;width:140px;">Thông tin người đảm nhận</th>
      </tr>
    </thead>
    <tbody>${rowsHTML}</tbody>
  </table>

  <div style="text-align:right;margin-top:24px;font-size:13px;">
    <div>Hà Nội, ngày ${new Date().getDate()} tháng ${new Date().getMonth() + 1} năm ${new Date().getFullYear()}</div>
    <div style="font-weight:bold;margin-top:4px;">TRƯỞNG PHÒNG</div>
    <div style="font-style:italic;margin-top:48px;">(Ký, ghi rõ họ tên)</div>
  </div>
</body></html>`;
}

function escape(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}
