"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TaskForm } from "./task-form";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface UserOption {
  id: string;
  name: string;
  position: string;
  department: string;
  teamGroupCode: string | null;
}

interface GroupOption {
  id: string;
  name: string;
  code: string;
}

export type NewTaskDialogVariant = "button" | "fab";

interface InitialValues {
  title?: string;
  description?: string;
  priority?: string;
  assigneeId?: string;
  taskGroupId?: string;
}

export function NewTaskDialog({
  users,
  groups,
  triggerLabel = "Giao việc mới",
  variant = "button",
  initialValues,
}: {
  users: UserOption[];
  groups: GroupOption[];
  triggerLabel?: string;
  /** "button" = button thường (header), "fab" = FAB tròn cố định mobile (Q5) */
  variant?: NewTaskDialogVariant;
  /** Pre-fill form (Q16: copy from existing task) */
  initialValues?: InitialValues;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {variant === "fab" ? (
          <button
            type="button"
            aria-label={triggerLabel}
            className={cn(
              // Q5: FAB cho mobile - chỉ hiện trên màn nhỏ
              "md:hidden fixed bottom-20 right-4 z-40",
              "h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg",
              "flex items-center justify-center hover:bg-primary/90 active:scale-95 transition",
              "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            )}
          >
            <Plus className="h-6 w-6" />
          </button>
        ) : (
          <Button>
            <Plus className="h-4 w-4" />
            {triggerLabel}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initialValues ? "Sao chép nhiệm vụ" : "Tạo nhiệm vụ mới"}</DialogTitle>
        </DialogHeader>
        <TaskForm
          users={users}
          groups={groups}
          onClose={() => setOpen(false)}
          initialValues={initialValues}
        />
      </DialogContent>
    </Dialog>
  );
}
