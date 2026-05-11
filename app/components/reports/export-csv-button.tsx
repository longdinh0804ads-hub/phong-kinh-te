"use client";

import { Button } from "@/components/ui/button";
import { Download, Printer } from "lucide-react";

export function ExportCSVButton({ data, filename }: { data: any[]; filename: string }) {
  function exportCSV() {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(","),
      ...data.map((row) =>
        headers
          .map((h) => {
            const val = String(row[h] ?? "").replace(/"/g, '""');
            return /[,\n"]/.test(val) ? `"${val}"` : val;
          })
          .join(",")
      ),
    ];
    const blob = new Blob(["﻿" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="outline" onClick={exportCSV} className="no-print">
      <Download className="h-4 w-4" /> Xuất CSV
    </Button>
  );
}

export function PrintButton() {
  return (
    <Button variant="outline" onClick={() => window.print()} className="no-print">
      <Printer className="h-4 w-4" /> In
    </Button>
  );
}
