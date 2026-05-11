import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium tracking-tight " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 " +
    "disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 " +
    "transition-all duration-200 ease-out active:scale-[0.97]",
  {
    variants: {
      variant: {
        // Primary: gradient navy + shadow lift on hover (bg-primary là fallback nếu gradient class chưa load)
        default: "bg-primary btn-gradient-primary text-primary-foreground shadow-sm hover:shadow-md hover:bg-primary/90",
        // Destructive: gradient đỏ + shadow nhẹ
        destructive: "bg-destructive btn-gradient-destructive text-white shadow-sm hover:shadow-md hover:bg-destructive/90",
        // Outline: hover làm sáng border + tint primary nhẹ
        outline:
          "border border-input bg-background shadow-sm " +
          "hover:bg-primary/5 hover:border-primary/40 hover:text-primary hover:shadow",
        // Secondary: subtle, hover sáng nhẹ
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm " +
          "hover:bg-secondary/70 hover:shadow",
        // Ghost: hover bg accent
        ghost: "hover:bg-accent hover:text-accent-foreground",
        // Link
        link: "text-primary underline-offset-4 hover:underline decoration-2",
      },
      size: {
        default: "h-11 px-5 py-2",
        sm: "h-9 px-3 text-xs",
        lg: "h-12 px-6 text-base",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { buttonVariants };
