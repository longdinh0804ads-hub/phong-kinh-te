"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Calendar as CalendarIcon, X, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { DATE_PRESETS, type DateRangePreset } from "@/lib/date-range";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import type { DateRange } from "react-day-picker";

interface DateRangeFilterProps {
  className?: string;
  showLabel?: boolean;
  preserveParams?: string[];
}

export function DateRangeFilter({
  className,
  showLabel = true,
  preserveParams,
}: DateRangeFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentRange = (searchParams.get("range") as DateRangePreset) || "all";
  const currentFrom = searchParams.get("from") || "";
  const currentTo = searchParams.get("to") || "";

  const [customOpen, setCustomOpen] = useState(false);
  const [pendingRange, setPendingRange] = useState<DateRange | undefined>(() =>
    currentFrom && currentTo
      ? { from: new Date(currentFrom), to: new Date(currentTo) }
      : undefined
  );

  function applyPreset(preset: DateRangePreset) {
    if (preset === "custom") {
      setPendingRange(
        currentFrom && currentTo
          ? { from: new Date(currentFrom), to: new Date(currentTo) }
          : undefined
      );
      setCustomOpen(true);
      return;
    }
    const params = buildParams({
      range: preset === "all" ? null : preset,
      from: null,
      to: null,
    });
    startTransition(() => router.push(`${pathname}?${params}`));
  }

  function applyCustom() {
    if (!pendingRange?.from) return;
    const from = pendingRange.from;
    const to = pendingRange.to ?? from; // single day chọn
    const params = buildParams({
      range: "custom",
      from: format(from, "yyyy-MM-dd"),
      to: format(to, "yyyy-MM-dd"),
    });
    startTransition(() => {
      router.push(`${pathname}?${params}`);
      setCustomOpen(false);
    });
  }

  function clearAll() {
    setPendingRange(undefined);
    const params = buildParams({ range: null, from: null, to: null });
    startTransition(() => {
      router.push(`${pathname}?${params}`);
      setCustomOpen(false);
    });
  }

  function buildParams(updates: Record<string, string | null>): string {
    const params = new URLSearchParams();
    searchParams.forEach((value, key) => {
      if (key !== "range" && key !== "from" && key !== "to") {
        if (!preserveParams || preserveParams.includes(key)) {
          params.set(key, value);
        }
      }
    });
    Object.entries(updates).forEach(([k, v]) => {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    });
    return params.toString();
  }

  const isCustom = currentRange === "custom";
  const customLabel = useMemo(() => {
    if (isCustom && currentFrom && currentTo) {
      const from = new Date(currentFrom);
      const to = new Date(currentTo);
      if (currentFrom === currentTo) return format(from, "dd/MM/yyyy");
      return `${format(from, "dd/MM")} – ${format(to, "dd/MM/yyyy")}`;
    }
    return "Tùy chỉnh";
  }, [isCustom, currentFrom, currentTo]);

  // Quick preset shortcuts in dialog
  const dialogPresets = [
    { value: "today", label: "Hôm nay" },
    { value: "yesterday", label: "Hôm qua" },
    { value: "this-week", label: "Tuần này" },
    { value: "this-month", label: "Tháng này" },
  ] as const;

  function applyDialogPreset(preset: DateRangePreset) {
    setCustomOpen(false);
    applyPreset(preset);
  }

  return (
    <>
      <div className={cn("flex items-center gap-2 flex-wrap", className)}>
        {showLabel && (
          <span className="text-sm text-muted-foreground inline-flex items-center gap-1.5 font-medium">
            <CalendarIcon className="h-4 w-4" />
            Thời gian:
          </span>
        )}
        <div className="flex gap-1 flex-wrap">
          {DATE_PRESETS.map((p) => {
            const active = p.value === "custom" ? isCustom : currentRange === p.value;
            return (
              <button
                key={p.value}
                onClick={() => applyPreset(p.value)}
                disabled={isPending}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-md border transition-colors whitespace-nowrap",
                  active
                    ? "bg-primary text-primary-foreground border-primary font-semibold shadow-sm"
                    : "hover:bg-accent border-input",
                  isPending && "opacity-60"
                )}
              >
                {p.value === "custom" ? customLabel : p.label}
              </button>
            );
          })}
          {currentRange !== "all" && (
            <button
              onClick={() => applyPreset("all")}
              disabled={isPending}
              className="px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              title="Xóa bộ lọc thời gian"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden gap-0">
          <DialogHeader className="px-6 pt-6 pb-3 border-b">
            <DialogTitle className="text-xl tracking-tight">Chọn khoảng thời gian</DialogTitle>
            <DialogDescription>
              Chọn ngày bắt đầu và ngày kết thúc trên lịch
            </DialogDescription>
          </DialogHeader>

          {/* Quick presets inside dialog */}
          <div className="flex gap-1.5 flex-wrap px-6 pt-4 pb-2">
            {dialogPresets.map((p) => (
              <button
                key={p.value}
                onClick={() => applyDialogPreset(p.value as DateRangePreset)}
                className="px-3 py-1.5 text-xs rounded-full border border-input bg-background hover:bg-accent transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="px-2 pb-2 flex justify-center">
            <Calendar
              mode="range"
              selected={pendingRange}
              onSelect={setPendingRange}
              numberOfMonths={1}
              defaultMonth={pendingRange?.from ?? new Date()}
            />
          </div>

          {/* Selected range display */}
          <div className="px-6 py-3 bg-muted/40 border-t border-b">
            <div className="text-xs text-muted-foreground mb-1.5 font-medium uppercase tracking-wide">
              Đã chọn
            </div>
            {pendingRange?.from ? (
              <div className="text-sm font-medium">
                {format(pendingRange.from, "EEEE, dd 'tháng' MM yyyy", { locale: vi })}
                {pendingRange.to && pendingRange.to.getTime() !== pendingRange.from.getTime() && (
                  <>
                    {" → "}
                    {format(pendingRange.to, "EEEE, dd 'tháng' MM yyyy", { locale: vi })}
                  </>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground italic">
                Chưa chọn ngày
              </div>
            )}
          </div>

          <DialogFooter className="px-6 py-4 sm:justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearAll}
              className="text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Xóa lọc
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCustomOpen(false)}
              >
                Hủy
              </Button>
              <Button
                type="button"
                onClick={applyCustom}
                disabled={!pendingRange?.from || isPending}
              >
                Áp dụng
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
