import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-lg border border-input bg-background px-3.5 py-2 text-sm shadow-sm " +
            "transition-all duration-200 ease-out " +
            "file:border-0 file:bg-transparent file:text-sm file:font-medium " +
            "placeholder:text-muted-foreground/70 " +
            // Hover: border đậm hơn nhẹ
            "hover:border-input/60 " +
            // Focus: glow effect navy mềm
            "focus-visible:outline-none focus-visible:border-primary focus-visible:shadow-[0_0_0_4px_hsl(var(--primary)/0.12)] " +
            // Invalid
            "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:shadow-[0_0_0_4px_hsl(var(--destructive)/0.15)] " +
            "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";
