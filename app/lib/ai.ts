// Unified AI abstraction: hỗ trợ Anthropic Claude, Google Gemini, DeepSeek.
// Auto-select provider + round-robin rotation giữa nhiều API key per provider.

import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import {
  getAnthropicRotator,
  getGeminiRotator,
  getDeepSeekRotator,
  getAnthropicRotatorAsync,
  getGeminiRotatorAsync,
  getDeepSeekRotatorAsync,
} from "./api-key-rotator";
import { recordUsage } from "./api-key-usage";
import { maskKey } from "./api-key-health";

export type AIProvider = "anthropic" | "gemini" | "deepseek";

export interface AIProviderInfo {
  id: AIProvider;
  label: string;
  model: string;
  available: boolean;
}

export const AI_MODELS = {
  anthropic: {
    label: "Claude Sonnet 4.5 (Anthropic)",
    model: "claude-sonnet-4-5",
  },
  gemini: {
    label: "Gemini 2.0 Flash (Google)",
    model: "gemini-2.5-flash",
  },
  deepseek: {
    label: "DeepSeek Chat",
    model: "deepseek-chat",
  },
} as const;

export function getAvailableProviders(): AIProviderInfo[] {
  return [
    {
      id: "anthropic",
      label: AI_MODELS.anthropic.label,
      model: AI_MODELS.anthropic.model,
      available: getAnthropicRotator().hasAvailableKey(),
    },
    {
      id: "gemini",
      label: AI_MODELS.gemini.label,
      model: AI_MODELS.gemini.model,
      available: getGeminiRotator().hasAvailableKey(),
    },
    {
      id: "deepseek",
      label: AI_MODELS.deepseek.label,
      model: AI_MODELS.deepseek.model,
      available: getDeepSeekRotator().hasAvailableKey(),
    },
  ];
}

/**
 * Auto-select provider:
 * 1. AI_PROVIDER env (nếu set và có key khả dụng)
 * 2. Provider có key khả dụng theo thứ tự: gemini > deepseek > anthropic
 */
export function getActiveProvider(): AIProvider | null {
  const preferred = process.env.AI_PROVIDER as AIProvider | undefined;
  const has = {
    anthropic: getAnthropicRotator().hasAvailableKey(),
    gemini: getGeminiRotator().hasAvailableKey(),
    deepseek: getDeepSeekRotator().hasAvailableKey(),
  };

  if (preferred && has[preferred]) return preferred;
  if (has.gemini) return "gemini";
  if (has.deepseek) return "deepseek";
  if (has.anthropic) return "anthropic";
  return null;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface StreamChatOptions {
  provider: AIProvider;
  systemPrompt?: string;
  /** @deprecated dùng `messages` để hỗ trợ multi-turn. Vẫn fallback cho backward compat. */
  userMessage?: string;
  /** Lịch sử hội thoại + tin nhắn hiện tại. Tin nhắn cuối phải là role 'user'. */
  messages?: ChatMessage[];
  maxTokens?: number;
  onChunk: (text: string) => void;
}

function resolveMessages(opts: StreamChatOptions): ChatMessage[] {
  if (opts.messages && opts.messages.length > 0) return opts.messages;
  if (opts.userMessage) return [{ role: "user", content: opts.userMessage }];
  throw new Error("streamChat: must provide either messages[] or userMessage");
}

/**
 * Stream chat completion từ provider được chọn.
 * Tự động rotate giữa các API key của provider đó nếu key đầu fail (rate limit/auth).
 */
export async function streamChat(opts: StreamChatOptions): Promise<string> {
  switch (opts.provider) {
    case "anthropic":
      return streamAnthropic(opts);
    case "gemini":
      return streamGemini(opts);
    case "deepseek":
      return streamDeepSeek(opts);
    default:
      throw new Error(`Unknown provider: ${opts.provider}`);
  }
}

// ===== Anthropic Claude =====
async function streamAnthropic(opts: StreamChatOptions): Promise<string> {
  const rotator = await getAnthropicRotatorAsync();
  const messages = resolveMessages(opts);
  return rotator.runWithRotation(async (apiKey) => {
    const keyPrefix = maskKey(apiKey);
    const startTime = Date.now();
    try {
      const client = new Anthropic({ apiKey });
      let full = "";
      let inputTokens = 0;
      let outputTokens = 0;
      const stream = await client.messages.stream({
        model: AI_MODELS.anthropic.model,
        max_tokens: opts.maxTokens ?? 1500,
        system: opts.systemPrompt,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      });
      for await (const chunk of stream) {
        if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
          const text = chunk.delta.text;
          full += text;
          opts.onChunk(text);
        }
        // message_start chứa input_tokens; message_delta chứa output_tokens
        if (chunk.type === "message_start") {
          inputTokens = chunk.message.usage?.input_tokens || 0;
        }
        if (chunk.type === "message_delta") {
          outputTokens = chunk.usage?.output_tokens || outputTokens;
        }
      }
      recordUsage({
        provider: "anthropic",
        keyPrefix,
        model: AI_MODELS.anthropic.model,
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: inputTokens + outputTokens,
        success: true,
        latencyMs: Date.now() - startTime,
      });
      return full;
    } catch (e: any) {
      recordUsage({
        provider: "anthropic",
        keyPrefix,
        model: AI_MODELS.anthropic.model,
        success: false,
        errorType: extractErrorType(e),
        latencyMs: Date.now() - startTime,
      });
      throw e;
    }
  });
}

// ===== Google Gemini =====
async function streamGemini(opts: StreamChatOptions): Promise<string> {
  const rotator = await getGeminiRotatorAsync();
  const messages = resolveMessages(opts);
  return rotator.runWithRotation(async (apiKey) => {
    const keyPrefix = maskKey(apiKey);
    const startTime = Date.now();
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: AI_MODELS.gemini.model,
        systemInstruction: opts.systemPrompt,
        generationConfig: {
          maxOutputTokens: opts.maxTokens ?? 1500,
          temperature: 0.3,
        },
      });
      let full = "";
      const lastIdx = messages.length - 1;
      if (messages[lastIdx].role !== "user") {
        throw new Error("Gemini: last message phải role=user");
      }
      const history = messages.slice(0, lastIdx).map((m) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.content }],
      }));
      const chat = model.startChat({ history });
      const result = await chat.sendMessageStream(messages[lastIdx].content);
      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
          full += text;
          opts.onChunk(text);
        }
      }
      // Extract usage từ final response
      const finalResp = await result.response;
      const usage = finalResp.usageMetadata;
      recordUsage({
        provider: "gemini",
        keyPrefix,
        model: AI_MODELS.gemini.model,
        promptTokens: usage?.promptTokenCount || 0,
        completionTokens: usage?.candidatesTokenCount || 0,
        totalTokens: usage?.totalTokenCount || 0,
        success: true,
        latencyMs: Date.now() - startTime,
      });
      return full;
    } catch (e: any) {
      recordUsage({
        provider: "gemini",
        keyPrefix,
        model: AI_MODELS.gemini.model,
        success: false,
        errorType: extractErrorType(e),
        latencyMs: Date.now() - startTime,
      });
      throw e;
    }
  });
}

/** Map error sang errorType chuẩn cho ApiKeyUsage */
function extractErrorType(e: any): "rate_limited" | "invalid" | "network" | "timeout" | "other" {
  const status = e?.status || e?.response?.status || 0;
  const msg = (e?.message || "").toLowerCase();
  if (status === 429 || /rate.{0,5}limit|quota|too.{0,3}many/i.test(msg)) return "rate_limited";
  if (status === 401 || status === 403 || /unauthorized|invalid.{0,5}key|forbidden/i.test(msg)) return "invalid";
  if (/network|fetch|econn|enotfound/i.test(msg)) return "network";
  if (/timeout|aborted/i.test(msg)) return "timeout";
  return "other";
}

// ===== DeepSeek (OpenAI-compatible) =====
async function streamDeepSeek(opts: StreamChatOptions): Promise<string> {
  const rotator = await getDeepSeekRotatorAsync();
  const inputMessages = resolveMessages(opts);
  return rotator.runWithRotation(async (apiKey) => {
    const keyPrefix = maskKey(apiKey);
    const startTime = Date.now();
    try {
      const client = new OpenAI({
        apiKey,
        baseURL: "https://api.deepseek.com/v1",
      });
      const messages: any[] = [];
      if (opts.systemPrompt) messages.push({ role: "system", content: opts.systemPrompt });
      for (const m of inputMessages) {
        messages.push({ role: m.role, content: m.content });
      }

      let full = "";
      let lastUsage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;
      const stream = await client.chat.completions.create({
        model: AI_MODELS.deepseek.model,
        messages,
        max_tokens: opts.maxTokens ?? 1500,
        temperature: 0.3,
        stream: true,
        stream_options: { include_usage: true },
      });
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) {
          full += text;
          opts.onChunk(text);
        }
        // OpenAI stream với include_usage: chunk cuối có usage
        if ((chunk as any).usage) lastUsage = (chunk as any).usage;
      }
      recordUsage({
        provider: "deepseek",
        keyPrefix,
        model: AI_MODELS.deepseek.model,
        promptTokens: lastUsage?.prompt_tokens || 0,
        completionTokens: lastUsage?.completion_tokens || 0,
        totalTokens: lastUsage?.total_tokens || 0,
        success: true,
        latencyMs: Date.now() - startTime,
      });
      return full;
    } catch (e: any) {
      recordUsage({
        provider: "deepseek",
        keyPrefix,
        model: AI_MODELS.deepseek.model,
        success: false,
        errorType: extractErrorType(e),
        latencyMs: Date.now() - startTime,
      });
      throw e;
    }
  });
}
