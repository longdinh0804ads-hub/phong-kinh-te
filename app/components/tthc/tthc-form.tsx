"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createTTHC } from "@/actions/tthc";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";

const COMMON_PROCEDURES = [
  { code: "DAT-CN-LD", name: "Cấp GCNQSD đất ở lần đầu" },
  { code: "DAT-CD-MD", name: "Chuyển mục đích sử dụng đất" },
  { code: "DAT-DC-SS", name: "Đính chính sai sót GCNQSD" },
  { code: "DAT-CD-NN", name: "Cấp đổi/cấp lại GCNQSD đất nông nghiệp sau DĐĐT" },
  { code: "DAT-GH-NN", name: "Gia hạn sử dụng đất nông nghiệp" },
  { code: "XD-GP", name: "Cấp giấy phép xây dựng" },
  { code: "XD-DC-GP", name: "Điều chỉnh giấy phép xây dựng" },
  { code: "MT-GP", name: "Cấp giấy phép môi trường" },
  { code: "ATTP", name: "Cấp giấy chứng nhận ATTP" },
];

const COMMON_AREAS = ["Mỹ Lương cũ", "Hữu Văn cũ", "Trần Phú cũ", "Hoàng Văn Thụ cũ", "Tân Tiến cũ", "Đồng Tâm cũ"];

export function TTHCForm({ users }: { users: { id: string; name: string; position: string; areas: string[] }[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [procedureCode, setProcedureCode] = useState("");
  const [procedureName, setProcedureName] = useState("");
  const [applicantName, setApplicantName] = useState("");
  const [applicantPhone, setApplicantPhone] = useState("");
  const [receivedDate, setReceivedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [deadline, setDeadline] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return format(d, "yyyy-MM-dd");
  });
  const [area, setArea] = useState("");
  const [handlerId, setHandlerId] = useState("");
  const [notes, setNotes] = useState("");

  function selectProcedure(code: string) {
    const p = COMMON_PROCEDURES.find((x) => x.code === code);
    if (p) {
      setProcedureCode(p.code);
      setProcedureName(p.name);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await createTTHC({
        procedureCode,
        procedureName,
        applicantName,
        applicantPhone: applicantPhone || null,
        receivedDate: new Date(receivedDate),
        deadline: new Date(deadline),
        area: area || null,
        handlerId: handlerId || null,
        notes: notes || null,
      });
      if (r.error) setError(r.error);
      else {
        router.push("/tthc");
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label>Loại thủ tục (chọn nhanh)</Label>
        <Select onValueChange={selectProcedure}>
          <SelectTrigger><SelectValue placeholder="Chọn TTHC phổ biến..." /></SelectTrigger>
          <SelectContent>
            {COMMON_PROCEDURES.map((p) => (
              <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="code">Mã thủ tục *</Label>
          <Input id="code" value={procedureCode} onChange={(e) => setProcedureCode(e.target.value)} required />
        </div>
        <div className="md:col-span-2 space-y-2">
          <Label htmlFor="name">Tên thủ tục *</Label>
          <Input id="name" value={procedureName} onChange={(e) => setProcedureName(e.target.value)} required />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="applicant">Họ tên người nộp *</Label>
          <Input id="applicant" value={applicantName} onChange={(e) => setApplicantName(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Số điện thoại</Label>
          <Input id="phone" type="tel" value={applicantPhone} onChange={(e) => setApplicantPhone(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="received">Ngày tiếp nhận *</Label>
          <Input id="received" type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dl">Hạn xử lý *</Label>
          <Input id="dl" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} required />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Địa bàn</Label>
          <Select value={area} onValueChange={setArea}>
            <SelectTrigger><SelectValue placeholder="Chọn địa bàn..." /></SelectTrigger>
            <SelectContent>
              {COMMON_AREAS.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Cán bộ xử lý</Label>
          <Select value={handlerId} onValueChange={setHandlerId}>
            <SelectTrigger><SelectValue placeholder="Chọn..." /></SelectTrigger>
            <SelectContent>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name} - {u.position}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Ghi chú</Label>
        <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>Hủy</Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin h-4 w-4" />}
          Tiếp nhận hồ sơ
        </Button>
      </div>
    </form>
  );
}
