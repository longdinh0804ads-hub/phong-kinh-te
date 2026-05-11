"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createUBNDDirective } from "@/actions/ubnd";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";

interface Props {
  users: { id: string; name: string; position: string; department: string }[];
}

export function UBNDForm({ users }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [documentNo, setDocumentNo] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [issuedDate, setIssuedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [deadline, setDeadline] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return format(d, "yyyy-MM-dd");
  });
  const [assigneeId, setAssigneeId] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await createUBNDDirective({
        documentNo: documentNo || null,
        title,
        content: content || null,
        issuedBy: "UBND Xã Trần Phú",
        issuedDate: new Date(issuedDate),
        deadline: new Date(deadline),
        assigneeId: assigneeId || null,
        attachments: [],
      });
      if (r.error) setError(r.error);
      else {
        router.push(`/ubnd/${r.id}`);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="documentNo">Số văn bản</Label>
          <Input
            id="documentNo"
            value={documentNo}
            onChange={(e) => setDocumentNo(e.target.value)}
            placeholder="VD: 234/UBND-VP"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="issuedDate">Ngày ban hành *</Label>
          <Input id="issuedDate" type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} required />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="title">Tên/Trích yếu nhiệm vụ *</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={300}
          placeholder="Ví dụ: Tham mưu kế hoạch thu chi ngân sách năm 2026"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="content">Nội dung chi tiết</Label>
        <Textarea
          id="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={5}
          placeholder="Trích yếu nội dung công văn, các yêu cầu cụ thể của UBND..."
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="deadline">Thời hạn xử lý *</Label>
          <Input id="deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="assignee">Phân công cán bộ chính</Label>
          <Select value={assigneeId} onValueChange={setAssigneeId}>
            <SelectTrigger>
              <SelectValue placeholder="Chọn cán bộ phụ trách..." />
            </SelectTrigger>
            <SelectContent>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name} - {u.position}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={isPending}>
          Hủy
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin h-4 w-4" />}
          Tiếp nhận
        </Button>
      </div>
    </form>
  );
}
