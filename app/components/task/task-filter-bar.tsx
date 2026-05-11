"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";

interface UserOption {
  id: string;
  name: string;
  position: string;
}

interface TaskFilterBarProps {
  users: UserOption[];
  /** Chỉ Trưởng phòng/Phó TP mới thấy filter người (rộng hơn assignee) */
  showAssigneeFilter: boolean;
}

const PRIORITY_OPTIONS = [
  { value: "all", label: "Mọi mức độ" },
  { value: "KHAN_CAP", label: "Khẩn cấp" },
  { value: "CAO", label: "Cao" },
  { value: "THUONG", label: "Thường" },
  { value: "THAP", label: "Thấp" },
];

const SORT_OPTIONS = [
  { value: "default", label: "Mặc định (ưu tiên + hạn)" },
  { value: "deadline-asc", label: "Hạn gần nhất" },
  { value: "deadline-desc", label: "Hạn xa nhất" },
  { value: "newest", label: "Mới tạo nhất" },
  { value: "oldest", label: "Cũ nhất" },
];

export function TaskFilterBar({ users, showAssigneeFilter }: TaskFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Local state cho input search (debounce)
  const [searchInput, setSearchInput] = useState(searchParams.get("search") || "");

  // Debounce search 350ms
  useEffect(() => {
    const handler = setTimeout(() => {
      const current = searchParams.get("search") || "";
      if (searchInput !== current) {
        updateParam("search", searchInput || null);
      }
    }, 350);
    return () => clearTimeout(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "all" && value !== "default") {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/tasks${params.toString() ? "?" + params.toString() : ""}`);
  }

  const currentPriority = searchParams.get("priority") || "all";
  const currentAssignee = searchParams.get("assigneeId") || "all";
  const currentSort = searchParams.get("sort") || "default";

  const hasAnyFilter =
    searchInput || currentPriority !== "all" || currentAssignee !== "all" || currentSort !== "default";

  function clearAll() {
    setSearchInput("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("search");
    params.delete("priority");
    params.delete("assigneeId");
    params.delete("sort");
    router.push(`/tasks${params.toString() ? "?" + params.toString() : ""}`);
  }

  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center">
      {/* Q1: Search input */}
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Tìm tiêu đề, mô tả nhiệm vụ..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="pl-9 pr-9"
        />
        {searchInput && (
          <button
            type="button"
            onClick={() => setSearchInput("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted"
            aria-label="Xóa tìm kiếm"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Q2: Filter Ưu tiên */}
      <Select value={currentPriority} onValueChange={(v) => updateParam("priority", v)}>
        <SelectTrigger className="w-full md:w-[160px]">
          <SelectValue placeholder="Ưu tiên" />
        </SelectTrigger>
        <SelectContent>
          {PRIORITY_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Q2: Filter Người nhận - chỉ Leader thấy */}
      {showAssigneeFilter && users.length > 0 && (
        <Select value={currentAssignee} onValueChange={(v) => updateParam("assigneeId", v)}>
          <SelectTrigger className="w-full md:w-[200px]">
            <SelectValue placeholder="Người nhận" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Mọi người</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name} <span className="text-muted-foreground">— {u.position}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Q19: Sort dropdown */}
      <Select value={currentSort} onValueChange={(v) => updateParam("sort", v)}>
        <SelectTrigger className="w-full md:w-[200px]">
          <SelectValue placeholder="Sắp xếp" />
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasAnyFilter && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clearAll}
          className="shrink-0"
        >
          <X className="h-4 w-4 mr-1" /> Xóa lọc
        </Button>
      )}
    </div>
  );
}
