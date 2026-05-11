"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createSchedule } from "@/actions/schedule";
import { Loader2, Plus } from "lucide-react";
import { format } from "date-fns";

interface Props {
  users: { id: string; name: string; position: string }[];
  canManageOthers: boolean;
}

export function ScheduleForm({ users, canManageOthers }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [location, setLocation] = useState("");
  const [userId, setUserId] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      await createSchedule({
        userId: canManageOthers ? userId || undefined : undefined,
        title,
        description: description || null,
        scheduleDate: new Date(date),
        location: location || null,
        isAllDay: false,
      });
      setTitle("");
      setDescription("");
      setLocation("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="title" className="text-sm">Nội dung *</Label>
        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="date" className="text-sm">Thời gian *</Label>
        <Input id="date" type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="location" className="text-sm">Địa điểm</Label>
        <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label className="text-sm">Mô tả</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </div>
      {canManageOthers && (
        <div className="space-y-2">
          <Label className="text-sm">Cho cán bộ</Label>
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger><SelectValue placeholder="Chính tôi" /></SelectTrigger>
            <SelectContent>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? <Loader2 className="animate-spin h-4 w-4" /> : <Plus className="h-4 w-4" />}
        Thêm lịch
      </Button>
    </form>
  );
}
