"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";
import { vi } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/**
 * Calendar tiếng Việt với typography mềm mại, chuyên nghiệp.
 * Dùng cho range picker, single date picker, etc.
 */
export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      locale={vi}
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-4",
        month: "flex flex-col gap-3",
        month_caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-base font-semibold tracking-tight capitalize",
        nav: "flex items-center justify-between absolute inset-x-0",
        button_previous: cn(
          "h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors absolute left-1 top-0"
        ),
        button_next: cn(
          "h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors absolute right-1 top-0"
        ),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday:
          "text-muted-foreground w-10 h-9 flex items-center justify-center font-medium text-xs uppercase tracking-wide",
        week: "flex w-full mt-1",
        day: cn(
          "relative w-10 h-10 text-center text-sm p-0",
          "[&:has([aria-selected])]:bg-primary/10",
          "first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md"
        ),
        day_button: cn(
          "h-10 w-10 inline-flex items-center justify-center rounded-md font-medium",
          "hover:bg-accent hover:text-foreground transition-colors",
          "aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:hover:bg-primary aria-selected:hover:text-primary-foreground",
          "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
        ),
        range_start:
          "rounded-l-md bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
        range_middle:
          "bg-primary/15 text-foreground rounded-none hover:bg-primary/20",
        range_end:
          "rounded-r-md bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
        selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
        today: "ring-1 ring-primary/40 ring-inset rounded-md font-semibold",
        outside: "text-muted-foreground/40 aria-selected:text-muted-foreground/60",
        disabled: "text-muted-foreground/30 cursor-not-allowed",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...props }: any) => {
          const Icon = orientation === "left" ? ChevronLeft : ChevronRight;
          return <Icon className="h-4 w-4" />;
        },
      }}
      {...props}
    />
  );
}
