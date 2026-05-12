"use client";

import { useState } from "react";
import { generateSpeechAction } from "@/actions/speech-writer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Mic, Loader2, Copy, RefreshCcw, FileText, AlertTriangle, CheckCircle2, BookMarked, Lightbulb } from "lucide-react";
import type { SpeechInput, SpeechResult, SpeechOccasion, SpeechAudience, SpeechLength } from "@/lib/ai-agents/speech-writer";

const OCCASIONS: { value: SpeechOccasion; label: string }[] = [
  { value: "so_ket", label: "Sơ kết / Báo cáo định kỳ" },
  { value: "tong_ket", label: "Tổng kết năm / nhiệm kỳ" },
  { value: "khai_mac", label: "Khai mạc hội nghị" },
  { value: "be_mac", label: "Bế mạc hội nghị" },
  { value: "giao_ban", label: "Họp giao ban" },
  { value: "trien_khai", label: "Triển khai văn bản chỉ đạo" },
  { value: "khen_thuong", label: "Khen thưởng / biểu dương" },
  { value: "tong_quat", label: "Phát biểu chung" },
];

const AUDIENCES: { value: SpeechAudience; label: string }[] = [
  { value: "lanh_dao", label: "Lãnh đạo cấp trên (UBND/HĐND)" },
  { value: "phong", label: "Cán bộ trong Phòng Kinh Tế" },
  { value: "lien_phong", label: "Liên phòng ban" },
  { value: "ubnd", label: "Hội nghị UBND xã" },
  { value: "cong_dan", label: "Nhân dân / công dân" },
  { value: "doan_kiem_tra", label: "Đoàn kiểm tra cấp trên" },
];

const LENGTHS: { value: SpeechLength; label: string; desc: string }[] = [
  { value: "ngan", label: "Ngắn", desc: "~300 từ, 1-2 phút" },
  { value: "vua", label: "Vừa", desc: "~700 từ, 4-5 phút" },
  { value: "dai", label: "Dài", desc: "~1300 từ, 8-10 phút" },
];

export function SpeechWriterClient() {
  const [occasion, setOccasion] = useState<SpeechOccasion>("so_ket");
  const [audience, setAudience] = useState<SpeechAudience>("ubnd");
  const [length, setLength] = useState<SpeechLength>("vua");
  const [topic, setTopic] = useState("");
  const [context, setContext] = useState("");
  const [autoLegalSearch, setAutoLegalSearch] = useState(true);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SpeechResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (topic.length < 5) {
      setError("Vui lòng nhập chủ đề ≥5 ký tự");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    const input: SpeechInput = {
      occasion,
      audience,
      length,
      topic,
      context: context || undefined,
      autoLegalSearch,
    };
    const r = await generateSpeechAction(input);
    if (r.ok) {
      setResult(r.result);
    } else {
      setError(r.error);
    }
    setLoading(false);
  }

  function copySpeech() {
    if (!result) return;
    navigator.clipboard.writeText(result.speech);
  }

  return (
    <div className="space-y-4">
      {/* Input form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Mic className="h-5 w-5 text-primary" />
            Thông tin bài phát biểu
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Chủ đề / Nội dung chính</Label>
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="VD: Sơ kết công tác bảo vệ môi trường Quý I/2026"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Mô tả ngắn gọn chủ đề - AI sẽ tự tìm văn bản pháp lý liên quan
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Loại bài phát biểu</Label>
              <select
                value={occasion}
                onChange={(e) => setOccasion(e.target.value as SpeechOccasion)}
                className="w-full h-11 rounded-lg border border-input bg-background px-3 text-sm"
              >
                {OCCASIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Đối tượng nghe</Label>
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value as SpeechAudience)}
                className="w-full h-11 rounded-lg border border-input bg-background px-3 text-sm"
              >
                {AUDIENCES.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label>Độ dài</Label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {LENGTHS.map((l) => (
                <button
                  key={l.value}
                  type="button"
                  onClick={() => setLength(l.value)}
                  className={`p-2 rounded-md border text-sm text-left transition-colors ${
                    length === l.value
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-muted-foreground/20 hover:border-muted-foreground/40"
                  }`}
                >
                  <div className="font-medium">{l.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{l.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Bối cảnh / số liệu cụ thể (tùy chọn)</Label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="VD: Đã kiểm tra 25 cơ sở, phát hiện 3 vi phạm về chất thải. Cán bộ X vừa được khen thưởng..."
              rows={4}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Càng cụ thể, bài viết càng có chất lượng. AI sẽ dùng các số liệu này thay vì bịa.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoLegalSearch}
              onChange={(e) => setAutoLegalSearch(e.target.checked)}
              className="rounded"
            />
            <span>
              Tự động tìm văn bản pháp lý liên quan để dẫn chiếu (RAG search)
            </span>
          </label>

          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <Button onClick={handleGenerate} disabled={loading || topic.length < 5} size="lg">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
            {loading ? "Đang soạn (~10-30s)..." : "Soạn bài phát biểu"}
          </Button>
        </CardContent>
      </Card>

      {/* Result */}
      {result && (
        <>
          {/* Outline preview */}
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                Bài phát biểu ({result.wordCount} từ)
              </CardTitle>
              <CardDescription>
                Dàn ý: {result.outline.length} mục · Trích dẫn: {result.citations.length} văn bản
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <details>
                <summary className="cursor-pointer text-sm font-medium hover:text-primary">
                  📐 Xem dàn ý
                </summary>
                <ol className="list-decimal list-inside mt-2 space-y-1 text-sm text-muted-foreground">
                  {result.outline.map((o, i) => (
                    <li key={i}>{o}</li>
                  ))}
                </ol>
              </details>

              {/* Suggested edits */}
              {result.suggestedEdits.length > 0 && (
                <div className="rounded-md bg-amber-50/50 border border-amber-200 p-3 text-sm">
                  <div className="font-medium flex items-center gap-1 mb-2 text-amber-900">
                    <Lightbulb className="h-4 w-4" /> Gợi ý chỉnh sửa từ AI
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-amber-800">
                    {result.suggestedEdits.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Warnings */}
              {result.warnings.length > 0 && (
                <div className="rounded-md bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">
                  ⚠ {result.warnings.join(" · ")}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Speech body */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Nội dung bài phát biểu
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={copySpeech}>
                  <Copy className="h-4 w-4" /> Copy
                </Button>
                <Button variant="outline" size="sm" onClick={() => setResult(null)}>
                  <RefreshCcw className="h-4 w-4" /> Soạn lại
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <article className="whitespace-pre-wrap text-sm leading-relaxed font-serif bg-muted/20 p-4 rounded-md">
                {result.speech}
              </article>
            </CardContent>
          </Card>

          {/* Citations */}
          {result.citations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BookMarked className="h-5 w-5" /> Văn bản đã trích dẫn
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-3">
                  {result.citations.map((c, i) => (
                    <li key={i} className="text-sm border-l-2 border-primary/30 pl-3">
                      <div className="font-medium">
                        [{i + 1}] {c.docNumber}
                        {c.article ? " - " + c.article : ""}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {c.docTitle}
                      </div>
                      <div className="text-xs italic text-muted-foreground mt-1">
                        "{c.excerpt}"
                      </div>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
