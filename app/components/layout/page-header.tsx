import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6 md:mb-8",
        className
      )}
    >
      <div className="min-w-0">
        <h1 className="text-balance">{title}</h1>
        {description && (
          <p className="text-muted-foreground mt-1.5 text-sm md:text-[15px] leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0 flex-wrap">{actions}</div>}
    </div>
  );
}
