// Tool registry - đăng ký mọi AI tool ở 1 chỗ.

import { db } from "../db";
import type { Role } from "@prisma/client";
import type { ToolDefinition, ToolContext, ToolResult } from "./types";
import { taskStatsTool, overdueTasksTool, myTasksTool, userWorkloadTool } from "./tools/task-tools";
import { ubndDirectivesTool } from "./tools/ubnd-tools";
import { searchLegalDocsTool } from "./tools/legal-tools";
import {
  createTaskTool,
  updateTaskStatusTool,
  addProgressReportTool,
  createReminderTool,
  addTaskNoteTool,
} from "./tools/write-tools";

const TOOLS: ToolDefinition[] = [
  // Read tools
  taskStatsTool,
  overdueTasksTool,
  myTasksTool,
  userWorkloadTool,
  ubndDirectivesTool,
  searchLegalDocsTool,
  // Write tools (cần confirm trước khi execute thật)
  createTaskTool,
  updateTaskStatusTool,
  addProgressReportTool,
  createReminderTool,
  addTaskNoteTool,
];

const TOOL_MAP = new Map<string, ToolDefinition>(TOOLS.map((t) => [t.name, t]));

/** Trả về tools mà user có quyền dùng */
export function getAvailableTools(role: Role): ToolDefinition[] {
  return TOOLS.filter((t) => {
    if (!t.requiresRole || t.requiresRole.length === 0) return true;
    return t.requiresRole.includes(role);
  });
}

/** Format danh sách tool dưới dạng OpenAI function schema (Gemini/DeepSeek đều dùng được) */
export function buildToolDefinitions(role: Role): Array<{
  type: "function";
  function: { name: string; description: string; parameters: Record<string, any> };
}> {
  return getAvailableTools(role).map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.jsonSchema,
    },
  }));
}

/** Format dưới dạng Gemini function declarations */
export function buildGeminiFunctionDeclarations(role: Role): Array<{
  name: string;
  description: string;
  parameters: Record<string, any>;
}> {
  return getAvailableTools(role).map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.jsonSchema,
  }));
}

/**
 * Execute 1 tool call với validation + audit log.
 * KHÔNG throw — luôn trả ToolResult.
 */
export async function executeTool(
  toolName: string,
  input: any,
  ctx: ToolContext
): Promise<ToolResult> {
  const startedAt = Date.now();
  const tool = TOOL_MAP.get(toolName);
  if (!tool) {
    return {
      toolName,
      success: false,
      error: `Tool không tồn tại: ${toolName}`,
    };
  }

  // Check permission
  if (tool.requiresRole && !tool.requiresRole.includes(ctx.user.role)) {
    await logAudit(ctx.user.id, toolName, input, null, false, "Forbidden", Date.now() - startedAt);
    return {
      toolName,
      success: false,
      error: "Không đủ quyền dùng chức năng này",
    };
  }

  // Validate input bằng Zod
  const parsed = tool.inputSchema.safeParse(input);
  if (!parsed.success) {
    const msg = "Input không hợp lệ: " + parsed.error.issues.map((i) => i.message).join(", ");
    await logAudit(ctx.user.id, toolName, input, null, false, msg, Date.now() - startedAt);
    return {
      toolName,
      success: false,
      error: msg,
    };
  }

  try {
    const output = await tool.execute(parsed.data, ctx);
    await logAudit(
      ctx.user.id,
      toolName,
      parsed.data,
      // Truncate output để không bloat DB - 4KB max
      sanitizeOutputForLog(output),
      true,
      null,
      Date.now() - startedAt
    );
    return {
      toolName,
      success: true,
      output,
    };
  } catch (e: any) {
    const errMsg = e?.message || "Lỗi không xác định";
    await logAudit(ctx.user.id, toolName, parsed.data, null, false, errMsg, Date.now() - startedAt);
    return {
      toolName,
      success: false,
      error: errMsg,
    };
  }
}

/** Audit log - lưu mọi tool call */
async function logAudit(
  userId: string,
  toolName: string,
  input: any,
  output: any,
  success: boolean,
  errorMsg: string | null,
  duration: number
): Promise<void> {
  try {
    await db.aIAuditLog.create({
      data: {
        userId,
        action: `tool:${toolName}`,
        tool: toolName,
        input: input as any,
        output: output as any,
        success,
        errorMsg: errorMsg || undefined,
        duration,
      },
    });
  } catch (e: any) {
    console.error("[ai-audit] Failed to log:", e?.message);
    // Best-effort - không fail tool execution vì audit log lỗi
  }
}

/** Cắt output để không bloat DB. Object lớn → giữ key + count, mảng dài → 10 phần tử đầu */
function sanitizeOutputForLog(out: any): any {
  if (out == null) return out;
  const json = JSON.stringify(out);
  if (json.length <= 4000) return out;
  // Quá lớn - tóm tắt
  if (Array.isArray(out)) {
    return { _truncated: true, _totalCount: out.length, sample: out.slice(0, 10) };
  }
  if (typeof out === "object") {
    return { _truncated: true, _keys: Object.keys(out), _preview: json.slice(0, 1000) };
  }
  return { _truncated: true, _preview: json.slice(0, 1000) };
}
