"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Search, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchInputProps {
  placeholder?: string;
  paramName?: string;
  className?: string;
  /** Debounce ms (default 350) */
  debounceMs?: number;
}

/**
 * Search input dùng chung cho list pages.
 * Sync với URL (?search=...) - debounce để không spam request.
 * Reusable: <SearchInput placeholder="Tìm văn bản..." />
 */
export function SearchInput({
  placeholder = "Tìm kiếm...",
  paramName = "search",
  className,
  debounceMs = 350,
}: SearchInputProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const initial = searchParams.get(paramName) || "";
  const [value, setValue] = useState(initial);

  // Sync state khi URL đổi từ bên ngoài
  useEffect(() => {
    setValue(searchParams.get(paramName) || "");
  }, [searchParams, paramName]);

  // Debounce: gõ xong 350ms mới push URL
  useEffect(() => {
    if (value === initial) return;
    const t = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(paramName, value);
      else params.delete(paramName);
      startTransition(() => router.push(`${pathname}?${params.toString()}`));
    }, debounceMs);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function clear() {
    setValue("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete(paramName);
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  return (
    <div className={cn("relative", className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-10"
      />
      {value && (
        <button
          type="button"
          onClick={clear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="Xóa tìm kiếm"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}
