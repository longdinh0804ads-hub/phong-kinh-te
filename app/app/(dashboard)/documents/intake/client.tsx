"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  dryClassifyDocument,
  confirmDocumentIntake,
  type ClassificationPreview,
  type IntakeConfirmInput,
} from "@/actions/document-intake";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Upload,
  FileText,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  RefreshCcw,
  AlertCircle,
  Building2,
  Calendar,
  Users,
  Target,
  ChevronRight,
} from "lucide-react";

interface UserOpt {
  id: string;
  name: string;
  position: string;
  department: string;
  fields: string[];
}

const ROUTING_LABELS: Record<string, { label: string; color: string; desc: string }> = {
  UBND_DIRECTIVE: {
    label: "Văn bản UBND giao việc",
    color: "bg-blue-100 text-blue-800 border-blue-200",
    desc: "Sẽ tạo bản ghi UBND Directive + nhiệm vụ con từ action items",
  },
  LEGAL_DOCUMENT: {
    label: "Văn bản pháp lý (Luật/NĐ/TT/QĐ)",
    color: "bg-emerald-100 text-emerald-800 border-emerald-200",
    desc: "Sẽ lưu vào kho văn bản tra cứu, chunk + embed cho AI search",
  },
  INTERNAL_TASK: {
    label: "Nhiệm vụ nội bộ",
    color: "bg-amber-100 text-amber-800 border-amber-200",
    desc: "Sẽ tạo 1 task cho cán bộ",
  },
  REVIEW_NEEDED: {
    label: "Cần xem xét thủ công",
    color: "bg-slate-100 text-slate-700 border-slate-200",
    desc: "AI không xác định rõ - vui lòng chọn loại bên dưới",
  },
};

const URGENCY_LABELS: Record<string, { label: string; color: string }> = {
  KHAN_CAP: { label: "Khẩn cấp", color: "bg-red-100 text-red-800" },
  CAO: { label: "Ưu tiên cao", color: "bg-orange-100 text-orange-800" },
  THUONG: { label: "Thường", color: "bg-slate-100 text-slate-700" },
  THAP: { label: "Thấp", color: "bg-gray-100 text-gray-600" },
};

const DEPT_LABELS: Record<string, string> = {
  BAN_LANH_DAO: "Ban Lãnh đạo",
  TAI_CHINH_KE_HOACH: "Tài chính - Kế hoạch",
  NONG_NGHIEP_MOI_TRUONG: "Nông nghiệp - Môi trường",
  XAY_DUNG_CONG_THUONG: "Xây dựng - Công thương",
};

export function DocumentIntakeClient({ users }: { users: UserOpt[] }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<"upload" | "classifying" | "review" | "saving" | "done">(
    "upload"
  );
  const [preview, setPreview] = useState<ClassificationPreview | null>(null);
  const [edits, setEdits] = useState<NonNullable<IntakeConfirmInput["edits"]>>({});
  const [routingOverride, setRoutingOverride] = useState<string | null>(null);
  const [createTasks, setCreateTasks] = useState(true);
  const [defaultAssigneeId, setDefaultAssigneeId] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string; createdId?: string; type?: string } | null>(
    null
  );

  async function handleClassify() {
    if (!file) return;
    setPhase("classifying");
    setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    const r = await dryClassifyDocument(fd);
    if (!r.ok || !r.classification) {
      setResult({ ok: false, message: r.error || "Phân loại thất bại" });
      setPhase("upload");
      return;
    }
    setPreview(r);
    setEdits({
      title: r.classification.title || undefined,
      docNumber: r.classification.docNumber || undefined,
      docType: r.classification.docType || undefined,
      issuedDate: r.classification.issuedDate || undefined,
      effectiveDate: r.classification.effectiveDate || undefined,
      summary: r.classification.summary,
      suggestedDept: r.classification.suggestedDept || undefined,
    });
    setRoutingOverride(null);
    setPhase("review");
  }

  async function handleConfirm() {
    if (!preview?.token) return;
    setPhase("saving");
    const finalRouting = (routingOverride || preview.classification?.routing) as any;
    const r = await confirmDocumentIntake({
      token: preview.token,
      routingOverride: finalRouting,
      edits,
      createTasksFromActionItems: createTasks,
      defaultAssigneeId,
    });
    if (r.ok) {
      setResult({
        ok: true,
        message: `Đã tạo ${r.createdType === "LEGAL_DOCUMENT" ? "văn bản pháp lý" : r.createdType === "UBND_DIRECTIVE" ? "nhiệm vụ UBND" : "nhiệm vụ"} thành công${r.createdTaskIds?.length ? ` + ${r.createdTaskIds.length} task con` : ""}`,
        createdId: r.createdId,
        type: r.createdType,
      });
      setPhase("done");
    } else {
      setResult({ ok: false, message: r.error || "Lưu thất bại" });
      setPhase("review");
    }
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setEdits({});
    setRoutingOverride(null);
    setResult(null);
    setPhase("upload");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ====== RENDER ======

  if (phase === "done" && result?.ok) {
    return (
      <Card className="border-emerald-200 bg-emerald-50/30">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
            <div className="flex-1">
              <div className="font-semibold text-emerald-900">Đã tiếp nhận thành công</div>
              <div className="text-sm text-emerald-700 mt-1">{result.message}</div>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" onClick={reset}>
                  <Upload className="h-4 w-4" /> Tiếp nhận văn bản khác
                </Button>
                {result.type === "UBND_DIRECTIVE" && (
                  <Button onClick={() => router.push(`/ubnd/${result.createdId}`)}>
                    Xem chi tiết <ChevronRight className="h-4 w-4" />
                  </Button>
                )}
                {result.type === "LEGAL_DOCUMENT" && (
                  <Button onClick={() => router.push("/legal")}>
                    Xem kho văn bản <ChevronRight className="h-4 w-4" />
                  </Button>
                )}
                {result.type === "TASK_ONLY" && (
                  <Button onClick={() => router.push(`/tasks/${result.createdId}`)}>
                    Xem nhiệm vụ <ChevronRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Upload area */}
      {phase === "upload" && (
        <Card>
          <CardContent className="pt-6">
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) setFile(f);
              }}
              className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-12 text-center cursor-pointer hover:border-primary/60 hover:bg-muted/30 transition-colors"
            >
              <Upload className="h-12 w-12 text-muted-foreground/60 mx-auto mb-3" />
              <p className="font-medium">Kéo thả file vào đây hoặc click để chọn</p>
              <p className="text-sm text-muted-foreground mt-1">PDF hoặc TXT, tối đa 20MB</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,application/pdf,text/plain"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </div>

            {file && (
              <div className="mt-4 flex items-center justify-between gap-3 p-3 bg-muted/40 rounded-md">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-5 w-5 text-primary shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{file.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(1)} KB
                    </div>
                  </div>
                </div>
                <Button onClick={handleClassify} size="sm">
                  <FileText className="h-4 w-4" /> Phân loại bằng AI
                </Button>
              </div>
            )}

            {result?.ok === false && (
              <div className="mt-4 rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive flex gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{result.message}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Classifying */}
      {phase === "classifying" && (
        <Card>
          <CardContent className="pt-6 text-center py-12">
            <Loader2 className="h-12 w-12 text-primary animate-spin mx-auto mb-3" />
            <p className="font-medium">Trợ lý AI đang phân loại văn bản...</p>
            <p className="text-sm text-muted-foreground mt-1">
              Trích xuất metadata, phân loại lĩnh vực, đề xuất phân công
            </p>
          </CardContent>
        </Card>
      )}

      {/* Review */}
      {phase === "review" && preview?.classification && (
        <ReviewPanel
          preview={preview}
          edits={edits}
          setEdits={setEdits}
          routingOverride={routingOverride}
          setRoutingOverride={setRoutingOverride}
          createTasks={createTasks}
          setCreateTasks={setCreateTasks}
          defaultAssigneeId={defaultAssigneeId}
          setDefaultAssigneeId={setDefaultAssigneeId}
          users={users}
          onCancel={reset}
          onConfirm={handleConfirm}
          result={result}
        />
      )}

      {/* Saving */}
      {phase === "saving" && (
        <Card>
          <CardContent className="pt-6 text-center py-12">
            <Loader2 className="h-12 w-12 text-primary animate-spin mx-auto mb-3" />
            <p className="font-medium">Đang lưu vào hệ thống...</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface ReviewProps {
  preview: ClassificationPreview;
  edits: NonNullable<IntakeConfirmInput["edits"]>;
  setEdits: (e: NonNullable<IntakeConfirmInput["edits"]>) => void;
  routingOverride: string | null;
  setRoutingOverride: (s: string | null) => void;
  createTasks: boolean;
  setCreateTasks: (b: boolean) => void;
  defaultAssigneeId: string | null;
  setDefaultAssigneeId: (id: string | null) => void;
  users: UserOpt[];
  onCancel: () => void;
  onConfirm: () => void;
  result: { ok: boolean; message: string } | null;
}

function ReviewPanel({
  preview,
  edits,
  setEdits,
  routingOverride,
  setRoutingOverride,
  createTasks,
  setCreateTasks,
  defaultAssigneeId,
  setDefaultAssigneeId,
  users,
  onCancel,
  onConfirm,
  result,
}: ReviewProps) {
  const c = preview.classification!;
  const finalRouting = (routingOverride || c.routing) as keyof typeof ROUTING_LABELS;
  const routingMeta = ROUTING_LABELS[finalRouting];
  const urgencyMeta = URGENCY_LABELS[c.urgency];

  // Filter users by suggestedDept
  const suggestedDept = edits.suggestedDept || c.suggestedDept;
  const deptUsers = suggestedDept
    ? users.filter((u) => u.department === suggestedDept)
    : users;

  return (
    <div className="space-y-4">
      {/* AI Classification Summary */}
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Trợ lý AI phân loại
              {!c.llmUsed && (
                <span className="text-xs font-normal bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                  Rule-based only
                </span>
              )}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={onCancel}>
              <RefreshCcw className="h-4 w-4" /> Phân loại lại
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Routing */}
          <div>
            <Label className="text-xs text-muted-foreground">Hướng xử lý đề xuất</Label>
            <div className={`mt-1 p-3 rounded-md border ${routingMeta.color}`}>
              <div className="font-medium">{routingMeta.label}</div>
              <div className="text-xs mt-1 opacity-80">{c.routingReason}</div>
            </div>
            <div className="mt-2 flex gap-1 text-xs flex-wrap">
              <span className="text-muted-foreground">Đổi hướng:</span>
              {Object.entries(ROUTING_LABELS).map(([k, v]) =>
                k !== c.routing ? (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setRoutingOverride(k)}
                    className={`px-2 py-0.5 rounded border ${
                      routingOverride === k ? v.color : "bg-white border-muted-foreground/20"
                    } hover:bg-muted/40`}
                  >
                    {v.label}
                  </button>
                ) : null
              )}
              {routingOverride && (
                <button
                  type="button"
                  onClick={() => setRoutingOverride(null)}
                  className="px-2 py-0.5 rounded text-muted-foreground hover:text-foreground"
                >
                  ↺ Reset
                </button>
              )}
            </div>
          </div>

          {/* Urgency + fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Mức độ</Label>
              <div className="mt-1">
                <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${urgencyMeta.color}`}>
                  {urgencyMeta.label}
                </span>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Lĩnh vực</Label>
              <div className="mt-1 flex gap-1 flex-wrap">
                {c.fields.length > 0 ? (
                  c.fields.map((f) => (
                    <span key={f} className="inline-block px-2 py-0.5 text-xs bg-muted rounded">
                      {f}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">Không rõ</span>
                )}
              </div>
            </div>
          </div>

          {/* Suggested dept */}
          {c.suggestedDept && (
            <div className="flex items-start gap-2 p-2 bg-amber-50/50 rounded text-sm">
              <Building2 className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <span className="font-medium">Đề xuất giao cho:</span>{" "}
                {DEPT_LABELS[c.suggestedDept] || c.suggestedDept}
                <span className="text-xs text-muted-foreground ml-2">
                  (độ tin cậy {(c.suggestedDeptConfidence * 100).toFixed(0)}%)
                </span>
              </div>
            </div>
          )}

          {/* Warnings */}
          {c.warnings.length > 0 && (
            <div className="rounded-md bg-amber-50/40 border border-amber-200 p-2 text-xs space-y-1">
              <div className="font-medium text-amber-900 flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" /> Lưu ý từ AI:
              </div>
              <ul className="list-disc list-inside text-amber-800">
                {c.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Thông tin văn bản (có thể chỉnh sửa)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Tiêu đề / Trích yếu</Label>
            <Input
              value={edits.title || ""}
              onChange={(e) => setEdits({ ...edits, title: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Số văn bản</Label>
              <Input
                value={edits.docNumber || ""}
                onChange={(e) => setEdits({ ...edits, docNumber: e.target.value })}
                placeholder="VD: 245/UBND-KT"
              />
            </div>
            <div>
              <Label>Loại văn bản</Label>
              <select
                value={edits.docType || ""}
                onChange={(e) => setEdits({ ...edits, docType: e.target.value as any })}
                className="w-full h-11 rounded-lg border border-input bg-background px-3 text-sm"
              >
                <option value="">-- chọn --</option>
                <option value="LUAT">Luật</option>
                <option value="NGHI_DINH">Nghị định</option>
                <option value="THONG_TU">Thông tư</option>
                <option value="QUYET_DINH">Quyết định</option>
                <option value="NGHI_QUYET">Nghị quyết</option>
                <option value="CONG_VAN">Công văn</option>
                <option value="OTHER">Khác</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Ngày ban hành</Label>
              <Input
                type="date"
                value={edits.issuedDate || ""}
                onChange={(e) => setEdits({ ...edits, issuedDate: e.target.value })}
              />
            </div>
            <div>
              <Label>Ngày hiệu lực / hạn xử lý</Label>
              <Input
                type="date"
                value={edits.effectiveDate || edits.deadline || ""}
                onChange={(e) => {
                  // Cùng field cho cả 2 routing
                  setEdits({
                    ...edits,
                    effectiveDate: e.target.value,
                    deadline: e.target.value,
                  });
                }}
              />
            </div>
          </div>
          <div>
            <Label>Tóm tắt</Label>
            <textarea
              value={edits.summary || ""}
              onChange={(e) => setEdits({ ...edits, summary: e.target.value })}
              rows={3}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Action items + assignee */}
      {(finalRouting === "UBND_DIRECTIVE" || finalRouting === "INTERNAL_TASK") &&
        c.actionItems.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="h-4 w-4" /> Nhiệm vụ cần làm ({c.actionItems.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                {c.actionItems.map((ai, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 bg-muted/30 rounded text-sm">
                    <span className="font-medium text-primary">{i + 1}.</span>
                    <div className="flex-1">
                      <div>{ai.action}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex gap-3">
                        {ai.owner && (
                          <span>
                            <Users className="inline h-3 w-3 mr-1" />
                            {ai.owner}
                          </span>
                        )}
                        {ai.deadline && (
                          <span>
                            <Calendar className="inline h-3 w-3 mr-1" />
                            {ai.deadline}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={createTasks}
                  onChange={(e) => setCreateTasks(e.target.checked)}
                  className="rounded"
                />
                <span>Tự động tạo task con cho từng nhiệm vụ trên</span>
              </label>

              {createTasks && (
                <div>
                  <Label>Giao mặc định cho cán bộ</Label>
                  <select
                    value={defaultAssigneeId || ""}
                    onChange={(e) => setDefaultAssigneeId(e.target.value || null)}
                    className="w-full h-11 rounded-lg border border-input bg-background px-3 text-sm"
                  >
                    <option value="">-- Để trống (TP/PTP gán sau) --</option>
                    {deptUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} - {u.position}
                      </option>
                    ))}
                  </select>
                  {suggestedDept && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Đang hiển thị cán bộ thuộc bộ phận{" "}
                      <strong>{DEPT_LABELS[suggestedDept] || suggestedDept}</strong>
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

      {/* Text excerpt */}
      {preview.textExcerpt && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Xem 500 ký tự đầu của văn bản ({preview.textLength} chars total)
          </summary>
          <pre className="mt-2 p-3 bg-muted/30 rounded text-xs whitespace-pre-wrap font-mono max-h-64 overflow-auto">
            {preview.textExcerpt}
          </pre>
        </details>
      )}

      {/* Error */}
      {result?.ok === false && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive flex gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{result.message}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 sticky bottom-4 bg-background/80 backdrop-blur p-2 rounded-lg border">
        <Button variant="outline" onClick={onCancel}>
          Hủy
        </Button>
        <Button onClick={onConfirm}>
          <CheckCircle2 className="h-4 w-4" /> Xác nhận & Lưu
        </Button>
      </div>
    </div>
  );
}
