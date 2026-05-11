"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { FileText, Calendar, Trash2, Loader2, AlertTriangle } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { deleteLegalDocument } from "@/actions/legal";

const DOC_TYPE_LABELS: Record<string, string> = {
  NGHI_DINH: "Nghị định",
  THONG_TU: "Thông tư",
  QUYET_DINH: "Quyết định",
  LUAT: "Luật",
  NGHI_QUYET: "Nghị quyết",
  CONG_VAN: "Công văn",
};

interface LegalDoc {
  id: string;
  title: string;
  docType: string;
  docNumber: string;
  issuedDate: Date | string;
  effectiveDate: Date | string;
  status: string;
  summary?: string | null;
}

interface Props {
  doc: LegalDoc;
  canDelete: boolean;
  chunkCount?: number;
}

export function LegalCard({ doc, canDelete, chunkCount }: Props) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const r = await deleteLegalDocument(doc.id);
      if ("error" in r) {
        setError(r.error);
      } else {
        setConfirmOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <FileText className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <Badge variant="outline">{DOC_TYPE_LABELS[doc.docType] ?? doc.docType}</Badge>
                <Badge variant="secondary">{doc.docNumber}</Badge>
                {doc.status === "superseded" && (
                  <Badge variant="destructive">Hết hiệu lực</Badge>
                )}
                {chunkCount !== undefined && (
                  <Badge variant="outline" className="text-xs">
                    {chunkCount} điều/khoản
                  </Badge>
                )}
              </div>
              <h3 className="font-semibold leading-snug">{doc.title}</h3>
              {doc.summary && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{doc.summary}</p>
              )}
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mt-2">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Ban hành: {formatDate(doc.issuedDate)}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Hiệu lực: {formatDate(doc.effectiveDate)}
                </span>
              </div>
            </div>
            {canDelete && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setConfirmOpen(true)}
                className="text-muted-foreground hover:text-destructive shrink-0"
                title="Xóa văn bản"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <DialogTitle>Xóa văn bản pháp lý?</DialogTitle>
                <DialogDescription>Hành động này không thể hoàn tác</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="py-2 space-y-2">
            <p className="text-sm">
              Bạn sắp xóa văn bản:
            </p>
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-xs">
                  {DOC_TYPE_LABELS[doc.docType] ?? doc.docType}
                </Badge>
                <Badge variant="secondary" className="text-xs">{doc.docNumber}</Badge>
              </div>
              <div className="font-medium">{doc.title}</div>
            </div>
            <p className="text-sm text-muted-foreground">
              Toàn bộ điều/khoản đã chunk cũng sẽ bị xóa khỏi hệ thống AI.
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={isPending}>
              Hủy
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Xóa văn bản
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
