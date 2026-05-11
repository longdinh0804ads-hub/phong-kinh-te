// AI Tool calling infrastructure types.
// Mỗi tool là 1 function được LLM gọi bằng JSON arguments.

import type { z } from "zod";
import type { Role, Department } from "@prisma/client";

export interface ToolContext {
  user: {
    id: string;
    role: Role;
    name: string;
    teamGroupCode: string | null;
    department: Department;
    /** TRUONG_BO_PHAN có thể quản nhiều bộ phận - rỗng = mặc định 1 dept */
    managedDepartments: Department[];
  };
  /** TRUE nếu user đã xác nhận và đang thực thi thật. Mặc định false (dry-run cho write tool). */
  confirmed?: boolean;
}

export interface ToolDefinition<TInput = any, TOutput = any> {
  /** Tên duy nhất, dùng làm function name khi gửi cho LLM */
  name: string;
  /** Mô tả ngắn cho LLM hiểu tool làm gì */
  description: string;
  /** Zod schema để validate input */
  inputSchema: z.ZodSchema<TInput>;
  /** JSON schema cho LLM function definition */
  jsonSchema: Record<string, any>;
  /** Loại tool: read (an toàn) hoặc write (cần confirm) */
  type: "read" | "write";
  /** Tool có cần permission đặc biệt không */
  requiresRole?: Role[];
  /** Handler thực thi tool */
  execute: (input: TInput, ctx: ToolContext) => Promise<TOutput>;
}

export interface ToolCall {
  name: string;
  input: any;
}

export interface ToolResult {
  toolName: string;
  success: boolean;
  output?: any;
  error?: string;
  /** Cho write tool: cần user confirm trước khi execute */
  requiresConfirmation?: boolean;
  /** Mô tả hành động sẽ làm (hiển thị cho user confirm) */
  confirmationPrompt?: string;
}

/**
 * Pending action - được tạo bởi write tool ở chế độ dry-run.
 * UI sẽ render card xác nhận, user click → submit lại tool name + input để execute thật.
 */
export interface PendingAction {
  /** ID tạm thời để UI track (random uuid) */
  id: string;
  /** Tên tool sẽ thực thi (vd: "createTask") */
  tool: string;
  /** Input đã validate, sẽ dùng để gọi lại tool */
  input: any;
  /** Câu hỏi xác nhận hiển thị cho user (vd: "Tạo nhiệm vụ X cho Y, hạn Z?") */
  preview: string;
  /** Chi tiết structured để render đẹp (label-value pairs) */
  details: Array<{ label: string; value: string }>;
  /** Loại action: "create-task" | "update-status" | "report-progress" | "create-reminder" */
  kind: string;
}

/** Magic key tool dùng để báo "đây là dry-run, cần confirm" */
export const PENDING_ACTION_KEY = "__pendingAction" as const;

/** Helper: tool dry-run trả về object có key này, agent loop sẽ detect và emit pendingAction */
export interface DryRunResult {
  [PENDING_ACTION_KEY]: PendingAction;
  /** Text ngắn để LLM dùng khi nói với user */
  message: string;
}

export function isDryRunResult(x: any): x is DryRunResult {
  return x && typeof x === "object" && PENDING_ACTION_KEY in x;
}
