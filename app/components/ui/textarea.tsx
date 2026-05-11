import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[100px] w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm shadow-sm " +
            "transition-all duration-200 ease-out " +
            "placeholder:text-muted-foreground/70 " +
            "hover:border-input/60 " +
            "focus-visible:outline-none focus-visible:border-primary focus-visible:shadow-[0_0_0_4px_hsl(var(--primary)/0.12)] " +
            "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";
