"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createIHanoiComplaint } from "@/actions/ihanoi";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";

export function IHanoiForm({ users }: { users: { id: string; name: string; position: string }[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [ticketCode, setTicketCode] = useState("");
  const [content, setContent] = useState("");
  const [citizenName, setCitizenName] = useState("");
  const [citizenPhone, setCitizenPhone] = useState("");
  const [citizenAddress, setCitizenAddress] = useState("");
  const [receivedDate, setReceivedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [deadline, setDeadline] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return format(d, "yyyy-MM-dd");
  });
  const [assigneeId, setAssigneeId] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await createIHanoiComplaint({
        ticketCode,
        content,
        citizenName: citizenName || null,
        citizenPhone: citizenPhone || null,
        citizenAddress: citizenAddress || null,
        receivedDate: new Date(receivedDate),
        deadline: deadline ? new Date(deadline) : null,
        assigneeId: assigneeId || null,
      });
      if (r.error) setError(r.error);
      else {
        router.push(`/ihanoi/${r.id}`);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="ticket">Mã phản ánh *</Label>
          <Input id="ticket" value={ticketCode} onChange={(e) => setTicketCode(e.target.value)} required placeholder="PA-2026-XXXXXX" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="received">Ngày tiếp nhận *</Label>
          <Input id="received" type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} required />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="content">Nội dung phản ánh *</Label>
        <Textarea id="content" value={content} onChange={(e) => setContent(e.target.value)} rows={4} required minLength={10} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="cname">Họ tên người dân</Label>
          <Input id="cname" value={citizenName} onChange={(e) => setCitizenName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cphone">Số điện thoại</Label>
          <Input id="cphone" type="tel" value={citizenPhone} onChange={(e) => setCitizenPhone(e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="caddr">Địa chỉ</Label>
        <Input id="caddr" value={citizenAddress} onChange={(e) => setCitizenAddress(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="dl">Hạn xử lý</Label>
          <Input id="dl" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Phân công xử lý</Label>
          <Select value={assigneeId} onValueChange={setAssigneeId}>
            <SelectTrigger><SelectValue placeholder="Chọn cán bộ..." /></SelectTrigger>
            <SelectContent>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name} - {u.position}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>Hủy</Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin h-4 w-4" />}
          Tiếp nhận
        </Button>
      </div>
    </form>
  );
}
