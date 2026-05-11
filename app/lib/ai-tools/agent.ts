// Agent loop - LLM gọi tool, ta execute, append result, loop tới khi LLM trả text.
// Support Gemini + DeepSeek (OpenAI-compatible).

import OpenAI from "openai";
import { GoogleGenerativeAI, FunctionCallingMode } from "@google/generative-ai";
import {
  getGeminiRotatorAsync,
  getDeepSeekRotatorAsync,
} from "@/lib/api-key-rotator";
import { recordUsage } from "@/lib/api-key-usage";
import { maskKey } from "@/lib/api-key-health";
import { AI_MODELS, type AIProvider, type ChatMessage } from "@/lib/ai";
import {
  buildToolDefinitions,
  buildGeminiFunctionDeclarations,
  executeTool,
} from "./registry";
import { isDryRunResult, PENDING_ACTION_KEY, type PendingAction, type ToolContext } from "./types";

const MAX_AGENT_ITERATIONS = 5;

export interface AgentRunOptions {
  provider: AIProvider;
  systemPrompt: string;
  messages: ChatMessage[];
  ctx: ToolContext;
  /** Callback streaming text final (mỗi chunk khi LLM trả về text) */
  onText: (text: string) => void;
  /** Callback khi LLM gọi 1 tool (cho UI hiển thị "đang gọi tool X...") */
  onToolCall?: (toolName: string, input: any) => void;
  /** Callback khi tool execute xong (cho UI biết kết quả) */
  onToolResult?: (toolName: string, success: boolean, output: any) => void;
  /** Callback khi write tool trả về pending action (cần user confirm) */
  onPendingAction?: (action: PendingAction) => void;
  maxTokens?: number;
}

/**
 * Chạy agent loop với function calling.
 * Returns full response text.
 */
export async function runAgentLoop(opts: AgentRunOptions): Promise<string> {
  if (opts.provider === "gemini") return runGeminiAgent(opts);
  if (opts.provider === "deepseek") return runDeepSeekAgent(opts);
  // Anthropic tool use khác hơn - fallback chạy stream thường
  throw new Error(`Agent loop chưa support provider: ${opts.provider}`);
}

/**
 * Helper: nếu tool output là dry-run → extract pending action, emit callback,
 * và thay output bằng version đã strip __pendingAction (LLM không cần thấy magic key).
 */
function handleDryRunOutput(
  toolName: string,
  output: any,
  onPendingAction?: (a: PendingAction) => void
): any {
  if (!isDryRunResult(output)) return output;
  const action = output[PENDING_ACTION_KEY];
  onPendingAction?.(action);
  // Strip magic key, chỉ trả message cho LLM
  return {
    requiresConfirmation: true,
    message: output.message,
    note: "Tool đã chuẩn bị action. UI đang hỏi user xác nhận. Không cần gọi tool nữa, chỉ trả lời ngắn cho user biết đang chờ xác nhận.",
  };
}

// =====================================================
// Gemini agent loop
// =====================================================
function classifyError(e: any): "rate_limited" | "invalid" | "network" | "timeout" | "other" {
  const status = e?.status || e?.response?.status || 0;
  const msg = (e?.message || "").toLowerCase();
  if (status === 429 || /rate.{0,5}limit|quota|too.{0,3}many/i.test(msg)) return "rate_limited";
  if (status === 401 || status === 403 || /unauthorized|invalid.{0,5}key|forbidden/i.test(msg)) return "invalid";
  if (/network|fetch|econn|enotfound/i.test(msg)) return "network";
  if (/timeout|aborted/i.test(msg)) return "timeout";
  return "other";
}

async function runGeminiAgent(opts: AgentRunOptions): Promise<string> {
  const rotator = await getGeminiRotatorAsync();
  const fnDecls = buildGeminiFunctionDeclarations(opts.ctx.user.role);

  return rotator.runWithRotation(async (apiKey) => {
    const keyPrefix = maskKey(apiKey);
    const startTime = Date.now();
    // Track tokens across iterations
    let totalPrompt = 0;
    let totalCompletion = 0;
    let totalTotal = 0;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: AI_MODELS.gemini.model,
      systemInstruction: opts.systemPrompt,
      generationConfig: {
        maxOutputTokens: opts.maxTokens ?? 4000,
        temperature: 0.2,
        // Tắt thinking budget cho Gemini 2.5 Flash.
        // Thinking mode đôi khi quyết định KHÔNG gọi tool (chỉ thinking + trả empty),
        // gây conversation rỗng. Tắt cho tool-calling deterministic hơn.
        // @ts-ignore - thinkingConfig là field mới của Gemini 2.5
        thinkingConfig: { thinkingBudget: 0 },
      },
      tools: fnDecls.length > 0 ? [{ functionDeclarations: fnDecls as any }] : undefined,
      toolConfig: {
        functionCallingConfig: { mode: FunctionCallingMode.AUTO },
      },
    });

    // Build initial Gemini chat history
    const lastIdx = opts.messages.length - 1;
    if (opts.messages[lastIdx].role !== "user") {
      throw new Error("Gemini agent: last message phải là user");
    }
    const history = opts.messages.slice(0, lastIdx).map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    }));

    const chat = model.startChat({ history });
    let lastInput: any = opts.messages[lastIdx].content;
    let finalText = "";

    try {
    for (let iter = 0; iter < MAX_AGENT_ITERATIONS; iter++) {
      const result = await chat.sendMessage(lastInput);
      const response = result.response;

      // Track tokens cho iter này
      const usage = (response as any).usageMetadata;
      if (usage) {
        totalPrompt += usage.promptTokenCount || 0;
        totalCompletion += usage.candidatesTokenCount || 0;
        totalTotal += usage.totalTokenCount || 0;
      }

      // Gemini SDK: response.functionCalls() trả array các function call
      const fnCalls = response.functionCalls?.() || [];

      if (fnCalls.length === 0) {
        // LLM trả text final
        let text = "";
        try {
          text = response.text() || "";
        } catch (e: any) {
          // response.text() throw khi bị safety filter block
          console.error("[agent] response.text() threw:", e?.message);
        }
        // Detect các trường hợp Gemini không trả gì (safety filter, empty completion...)
        if (!text) {
          const cand = response.candidates?.[0];
          const finishReason = cand?.finishReason;
          const safety = cand?.safetyRatings;
          console.error(
            `[agent] Gemini empty response (iter=${iter}): finishReason=${finishReason}, safety=${JSON.stringify(safety)}`
          );
          // Trả message rõ ràng thay vì empty để UI hiển thị + user biết retry
          text =
            finishReason === "SAFETY"
              ? "Câu hỏi bị bộ lọc an toàn của AI chặn. Vui lòng đặt lại câu hỏi rõ ràng hơn."
              : "Tôi chưa hiểu rõ câu hỏi. Bạn có thể diễn đạt lại được không?";
        }
        finalText = text;
        opts.onText(text);
        recordUsage({
          provider: "gemini",
          keyPrefix,
          model: AI_MODELS.gemini.model,
          promptTokens: totalPrompt,
          completionTokens: totalCompletion,
          totalTokens: totalTotal,
          success: true,
          latencyMs: Date.now() - startTime,
        });
        return finalText;
      }

      // Execute từng tool và build function response
      const fnResponses: any[] = [];
      for (const fc of fnCalls) {
        const args = (fc.args as any) || {};
        opts.onToolCall?.(fc.name, args);

        const result = await executeTool(fc.name, args, opts.ctx);
        // Detect dry-run output → emit pending action
        const cleanOutput = result.success
          ? handleDryRunOutput(fc.name, result.output, opts.onPendingAction)
          : result.output;

        opts.onToolResult?.(fc.name, result.success, cleanOutput ?? result.error);

        fnResponses.push({
          functionResponse: {
            name: fc.name,
            response: result.success
              ? { result: cleanOutput }
              : { error: result.error },
          },
        });
      }

      // Feed lại cho Gemini để tiếp tục
      lastInput = fnResponses;
    }

    // Hết MAX_AGENT_ITERATIONS - record usage (vẫn success vì không throw)
    recordUsage({
      provider: "gemini",
      keyPrefix,
      model: AI_MODELS.gemini.model,
      promptTokens: totalPrompt,
      completionTokens: totalCompletion,
      totalTokens: totalTotal,
      success: true,
      latencyMs: Date.now() - startTime,
    });
    return finalText || "Đã vượt quá số bước tối đa. Vui lòng đặt câu hỏi cụ thể hơn.";
    } catch (e: any) {
      recordUsage({
        provider: "gemini",
        keyPrefix,
        model: AI_MODELS.gemini.model,
        promptTokens: totalPrompt,
        completionTokens: totalCompletion,
        totalTokens: totalTotal,
        success: false,
        errorType: classifyError(e),
        latencyMs: Date.now() - startTime,
      });
      throw e;
    }
  });
}

// =====================================================
// DeepSeek agent loop (OpenAI-compatible function calling)
// =====================================================
async function runDeepSeekAgent(opts: AgentRunOptions): Promise<string> {
  const rotator = await getDeepSeekRotatorAsync();
  const tools = buildToolDefinitions(opts.ctx.user.role);

  return rotator.runWithRotation(async (apiKey) => {
    const keyPrefix = maskKey(apiKey);
    const startTime = Date.now();
    let totalPrompt = 0;
    let totalCompletion = 0;
    let totalTotal = 0;

    try {
    const client = new OpenAI({
      apiKey,
      baseURL: "https://api.deepseek.com/v1",
    });

    // Build OpenAI messages
    const messages: any[] = [
      { role: "system", content: opts.systemPrompt },
      ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    let finalText = "";

    for (let iter = 0; iter < MAX_AGENT_ITERATIONS; iter++) {
      const completion = await client.chat.completions.create({
        model: AI_MODELS.deepseek.model,
        messages,
        tools: tools.length > 0 ? (tools as any) : undefined,
        tool_choice: tools.length > 0 ? "auto" : undefined,
        temperature: 0.2,
        max_tokens: opts.maxTokens ?? 4000,
      });

      // Track tokens
      const u = (completion as any).usage;
      if (u) {
        totalPrompt += u.prompt_tokens || 0;
        totalCompletion += u.completion_tokens || 0;
        totalTotal += u.total_tokens || 0;
      }

      const msg = completion.choices[0]?.message;
      if (!msg) break;

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        // Append assistant message với tool_calls
        messages.push({
          role: "assistant",
          content: msg.content || "",
          tool_calls: msg.tool_calls,
        });

        // Execute từng tool và append tool response
        for (const tc of msg.tool_calls) {
          if (tc.type !== "function") continue;
          const fnName = tc.function.name;
          let args: any = {};
          try {
            args = JSON.parse(tc.function.arguments || "{}");
          } catch {
            // ignore parse error - args stays empty
          }

          opts.onToolCall?.(fnName, args);
          const result = await executeTool(fnName, args, opts.ctx);
          const cleanOutput = result.success
            ? handleDryRunOutput(fnName, result.output, opts.onPendingAction)
            : result.output;
          opts.onToolResult?.(fnName, result.success, cleanOutput ?? result.error);

          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(
              result.success ? { result: cleanOutput } : { error: result.error }
            ),
          });
        }
        // Tiếp tục loop để LLM xử lý kết quả tool
        continue;
      }

      // No tool calls → final text
      if (msg.content) {
        finalText = msg.content;
        opts.onText(msg.content);
      }
      recordUsage({
        provider: "deepseek",
        keyPrefix,
        model: AI_MODELS.deepseek.model,
        promptTokens: totalPrompt,
        completionTokens: totalCompletion,
        totalTokens: totalTotal,
        success: true,
        latencyMs: Date.now() - startTime,
      });
      return finalText;
    }

    recordUsage({
      provider: "deepseek",
      keyPrefix,
      model: AI_MODELS.deepseek.model,
      promptTokens: totalPrompt,
      completionTokens: totalCompletion,
      totalTokens: totalTotal,
      success: true,
      latencyMs: Date.now() - startTime,
    });
    return finalText || "Đã vượt quá số bước tối đa. Vui lòng đặt câu hỏi cụ thể hơn.";
    } catch (e: any) {
      recordUsage({
        provider: "deepseek",
        keyPrefix,
        model: AI_MODELS.deepseek.model,
        promptTokens: totalPrompt,
        completionTokens: totalCompletion,
        totalTokens: totalTotal,
        success: false,
        errorType: classifyError(e),
        latencyMs: Date.now() - startTime,
      });
      throw e;
    }
  });
}
