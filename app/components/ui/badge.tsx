import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-tight " +
    "transition-all duration-200 ease-out",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground " +
          "shadow-sm hover:shadow",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground " +
          "hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-white " +
          "shadow-sm hover:shadow",
        outline:
          "text-foreground border-border " +
          "hover:border-foreground/30",
        success:
          "border-emerald-200 bg-emerald-50 text-emerald-800 " +
          "hover:bg-emerald-100",
        warning:
          "border-amber-200 bg-amber-50 text-amber-800 " +
          "hover:bg-amber-100",
        info:
          "border-blue-200 bg-blue-50 text-blue-800 " +
          "hover:bg-blue-100",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  /** Hiển thị pulse-ring effect cho urgent items (vd thông báo overdue) */
  urgent?: boolean;
}

export function Badge({ className, variant, urgent, ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        badgeVariants({ variant }),
        urgent && "animate-pulse-ring",
        className
      )}
      {...props}
    />
  );
}
