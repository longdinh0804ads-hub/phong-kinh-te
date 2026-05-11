"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { uploadLegalDocument } from "@/actions/legal";
import { Loader2, CheckCircle2, FileUp, Sparkles, AlertCircle, FileText, X } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const DOC_TYPES = [
  { value: "NGHI_DINH", label: "Nghị định" },
  { value: "THONG_TU", label: "Thông tư" },
  { value: "QUYET_DINH", label: "Quyết định" },
  { value: "LUAT", label: "Luật" },
  { value: "NGHI_QUYET", label: "Nghị quyết" },
  { value: "CONG_VAN", label: "Công văn" },
];

interface PDFParseResult {
  metadata: {
    docType: string | null;
    docNumber: string | null;
    title: string | null;
    issuedDate: string | null;
    effectiveDate: string | null;
    summary: string | null;
    fullText: string;
    warnings: string[];
  };
  fileName: string;
  fileSize: number;
  pageCount: number;
  textLength?: number;
  usedOCR?: boolean;
  ocrBatches?: { batchCount: number; failedBatches: number[] } | null;
}

export function LegalUploadForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ chunks: number } | null>(null);

  // PDF upload state
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfParsing, setPdfParsing] = useState(false);
  const [pdfWarnings, setPdfWarnings] = useState<string[]>([]);
  const [pdfPageCount, setPdfPageCount] = useState<number | null>(null);
  const [pdfTextLength, setPdfTextLength] = useState<number | null>(null);
  const [pdfUsedOCR, setPdfUsedOCR] = useState(false);
  const [pdfOcrBatches, setPdfOcrBatches] = useState<{ batchCount: number; failedBatches: number[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState<any>("NGHI_DINH");
  const [docNumber, setDocNumber] = useState("");
  const [issuedDate, setIssuedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [effectiveDate, setEffectiveDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [summary, setSummary] = useState("");
  const [fullText, setFullText] = useState("");

  async function handlePDFUpload(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Chỉ chấp nhận file PDF");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError("File quá lớn (tối đa 50MB)");
      return;
    }

    setError(null);
    setPdfFile(file);
    setPdfWarnings([]);
    setPdfParsing(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/legal/parse-pdf", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Không phân tích được PDF");
        setPdfFile(null);
        return;
      }

      const result = data as PDFParseResult;
      const m = result.metadata;

      // Auto-fill form
      if (m.docType) setDocType(m.docType);
      if (m.docNumber) setDocNumber(m.docNumber);
      if (m.title) setTitle(m.title);
      if (m.issuedDate) setIssuedDate(m.issuedDate);
      if (m.effectiveDate) setEffectiveDate(m.effectiveDate);
      if (m.summary) setSummary(m.summary);
      setFullText(m.fullText);
      setPdfWarnings(m.warnings || []);
      setPdfPageCount(result.pageCount);
      setPdfTextLength(result.textLength ?? null);
      setPdfUsedOCR(!!result.usedOCR);
      setPdfOcrBatches(result.ocrBatches ?? null);
    } catch (e: any) {
      setError("Lỗi xử lý PDF: " + (e?.message || "không rõ"));
      setPdfFile(null);
    } finally {
      setPdfParsing(false);
    }
  }

  function clearPDF() {
    setPdfFile(null);
    setPdfWarnings([]);
    setPdfPageCount(null);
    setPdfTextLength(null);
    setPdfUsedOCR(false);
    setPdfOcrBatches(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const r = await uploadLegalDocument({
        title,
        docType,
        docNumber,
        issuedDate: new Date(issuedDate),
        effectiveDate: new Date(effectiveDate),
        summary: summary || null,
        fullText,
      });
      if ("error" in r) {
        setError(r.error);
      } else if (r.success) {
        setSuccess({ chunks: r.chunkCount });
        setTimeout(() => {
          router.push("/legal");
          router.refresh();
        }, 1500);
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* PDF Upload Section */}
      <div className="rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-base">Tự động trích xuất từ PDF</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          Tải lên file PDF văn bản pháp lý → Hệ thống tự đọc và điền các thông tin bên dưới. Bạn có
          thể chỉnh sửa nếu cần.
        </p>

        {!pdfFile ? (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handlePDFUpload(file);
              }}
              className="hidden"
              id="pdf-upload"
              disabled={pdfParsing}
            />
            <label
              htmlFor="pdf-upload"
              className={cn(
                "flex items-center justify-center gap-2 w-full py-3 px-4 rounded-md border bg-background hover:bg-accent transition-colors cursor-pointer",
                pdfParsing && "opacity-60 cursor-not-allowed"
              )}
            >
              {pdfParsing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang phân tích PDF... (có thể mất vài phút với file lớn / có chữ ký số)
                </>
              ) : (
                <>
                  <FileUp className="h-4 w-4" />
                  Chọn file PDF (tối đa 50MB)
                </>
              )}
            </label>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-md bg-background border">
              <FileText className="h-8 w-8 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{pdfFile.name}</div>
                <div className="text-xs text-muted-foreground">
                  {(pdfFile.size / 1024).toFixed(0)} KB
                  {pdfPageCount && ` · ${pdfPageCount} trang`}
                  {pdfTextLength !== null && ` · ${pdfTextLength.toLocaleString("vi")} ký tự đọc được`}
                </div>
              </div>
              {pdfParsing ? (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <button
                    type="button"
                    onClick={clearPDF}
                    className="p-1 hover:bg-accent rounded"
                    title="Xóa file"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>

            {pdfWarnings.length > 0 && (
              <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-0.5">
                    <div className="font-semibold text-amber-900">Cảnh báo - Vui lòng kiểm tra:</div>
                    <ul className="list-disc list-inside space-y-0.5 text-amber-800">
                      {pdfWarnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {!pdfParsing && pdfWarnings.length === 0 && (
              <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
                ✓ Đã tự động trích xuất đầy đủ metadata.
                {pdfUsedOCR && " (Sử dụng OCR cho file scan)"} Vui lòng kiểm tra lại bên dưới.
              </div>
            )}
            {!pdfParsing && pdfUsedOCR && (
              <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800">
                🔍 Đã dùng OCR (AI Vision) để đọc nội dung từ PDF scan/ký số.
                {pdfOcrBatches && pdfOcrBatches.batchCount > 1 && (
                  <span>
                    {" "}File lớn → chia thành <span className="font-semibold">{pdfOcrBatches.batchCount} batch</span>.
                  </span>
                )}
              </div>
            )}
            {!pdfParsing && pdfOcrBatches && pdfOcrBatches.failedBatches.length > 0 && (
              <div className="rounded-md bg-amber-50 border-2 border-amber-300 p-3 text-sm text-amber-900">
                <div className="font-semibold mb-1">⚠ Cảnh báo: {pdfOcrBatches.failedBatches.length} batch OCR thất bại</div>
                <div>
                  Các batch số <span className="font-mono">{pdfOcrBatches.failedBatches.join(", ")}</span> không đọc được.
                  Trong nội dung phía dưới sẽ có dòng đánh dấu các trang bị thiếu — vui lòng <strong>kiểm tra thủ công</strong> và bổ sung nội dung trước khi lưu.
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Manual Form */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Loại văn bản *</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2 space-y-2">
            <Label htmlFor="docNumber">Số văn bản *</Label>
            <Input id="docNumber" value={docNumber} onChange={(e) => setDocNumber(e.target.value)} required placeholder="VD: 78/2025/NĐ-CP" />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="title">Tên/Trích yếu *</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={500} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="issued">Ngày ban hành *</Label>
            <Input id="issued" type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="effective">Ngày hiệu lực *</Label>
            <Input id="effective" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} required />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="summary">Tóm tắt</Label>
          <Textarea id="summary" value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} placeholder="Tóm tắt nội dung chính (tùy chọn)" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="text">Toàn văn nội dung *</Label>
          <Textarea
            id="text"
            value={fullText}
            onChange={(e) => setFullText(e.target.value)}
            rows={pdfFile ? 8 : 15}
            required
            minLength={100}
            className="font-mono text-sm"
            placeholder="Dán toàn văn nội dung văn bản. Hệ thống sẽ tự động chia thành các Điều/Khoản để AI tra cứu."
          />
          <p className="text-xs text-muted-foreground">
            {fullText.length.toLocaleString("vi")} ký tự. Hệ thống sẽ tự chunk theo cấu trúc Điều/Khoản tiếng Việt.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive whitespace-pre-line">
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 text-emerald-600 text-sm">
          <CheckCircle2 className="h-4 w-4" />
          Upload thành công! Đã tạo {success.chunks} chunk. Đang chuyển hướng...
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>Hủy</Button>
        <Button type="submit" disabled={isPending || pdfParsing}>
          {isPending && <Loader2 className="animate-spin h-4 w-4" />}
          Tải lên
        </Button>
      </div>
    </form>
  );
}
