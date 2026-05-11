import { z } from "zod";

export const taskCreateSchema = z.object({
  title: z.string().min(3, "Tiêu đề tối thiểu 3 ký tự").max(200, "Tiêu đề tối đa 200 ký tự"),
  description: z.string().max(5000).optional().nullable(),
  priority: z.enum(["KHAN_CAP", "CAO", "THUONG", "THAP"]).default("THUONG"),
  deadline: z.coerce.date(),
  assigneeId: z.string().optional().nullable(),
  taskGroupId: z.string().optional().nullable(),
  parentTaskId: z.string().optional().nullable(),
  legalReferences: z.array(z.string()).default([]),
  attachments: z.array(z.string()).default([]),
  sourceType: z.enum(["INTERNAL", "UBND_DIRECTIVE", "IHANOI"]).default("INTERNAL"),
  sourceId: z.string().optional().nullable(),
}).refine(
  (data) => data.assigneeId || data.taskGroupId,
  { message: "Phải chọn người nhận hoặc nhóm thực hiện", path: ["assigneeId"] }
);

export const taskUpdateSchema = z.object({
  id: z.string(),
  title: z.string().min(3).max(200).optional(),
  description: z.string().max(5000).optional().nullable(),
  priority: z.enum(["KHAN_CAP", "CAO", "THUONG", "THAP"]).optional(),
  deadline: z.coerce.date().optional(),
  status: z
    .enum(["PENDING", "IN_PROGRESS", "AWAITING_REVIEW", "COMPLETED", "OVERDUE", "CANCELLED"])
    .optional(),
  assigneeId: z.string().optional().nullable(),
  taskGroupId: z.string().optional().nullable(),
  legalReferences: z.array(z.string()).optional(),
});

export const progressReportSchema = z.object({
  taskId: z.string(),
  percentComplete: z.number().int().min(0).max(100),
  notes: z.string().max(2000).optional().nullable(),
  blockers: z.string().max(1000).optional().nullable(),
});

export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;
export type ProgressReportInput = z.infer<typeof progressReportSchema>;
