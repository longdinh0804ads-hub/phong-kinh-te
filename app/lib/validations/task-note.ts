import { z } from "zod";

export const taskNoteCreateSchema = z.object({
  taskId: z.string().min(1),
  content: z
    .string()
    .min(2, "Nội dung tối thiểu 2 ký tự")
    .max(2000, "Nội dung tối đa 2000 ký tự"),
  isPinned: z.boolean().optional().default(false),
});

export const taskNoteUpdateSchema = z.object({
  id: z.string().min(1),
  content: z
    .string()
    .min(2, "Nội dung tối thiểu 2 ký tự")
    .max(2000, "Nội dung tối đa 2000 ký tự"),
});

export type TaskNoteCreateInput = z.infer<typeof taskNoteCreateSchema>;
export type TaskNoteUpdateInput = z.infer<typeof taskNoteUpdateSchema>;
