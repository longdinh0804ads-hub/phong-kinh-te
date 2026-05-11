import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { canUseAI } from "@/lib/permissions";
import { RAG_SYSTEM_PROMPT } from "@/lib/rag";
import {
  retrieveWithArticleExpansion,
  buildArticleGroupedMessage,
  articleGroupsToSources,
} from "@/lib/rag-article-expansion";
import { loadConversationHistory, buildChatMessages } from "@/lib/rag-conversation";
import { streamChat, getActiveProvider } from "@/lib/ai";
import { checkRateLimit, cleanupRateLimiterIfNeeded } from "@/lib/rate-limiter";
import { runAgentLoop } from "@/lib/ai-tools/agent";
import { buildAgentSystemPrompt } from "@/lib/ai-tools/system-prompt";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Chat endpoint - server tự chọn AI provider, KHÔNG tiết lộ cho client.
 * User chỉ gửi câu hỏi, không biết model nào đang trả lời.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!canUseAI(user.role)) return new Response("Forbidden", { status: 403 });

  // Rate limit: 20 requests/phút/user (chat AI)
  cleanupRateLimiterIfNeeded();
  const rl = checkRateLimit(`ai-chat:${user.id}`, 20, 60 * 1000);
  if (!rl.allowed) {
    return new Response(
      `Đã đạt giới hạn 20 câu hỏi/phút. Vui lòng thử lại sau ${Math.ceil(rl.resetAfterMs / 1000)}s.`,
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetAfterMs / 1000)) } }
    );
  }

  const { question, conversationId: clientConvId } = await req.json();
  if (!question || typeof question !== "string" || question.length < 3) {
    return new Response("Invalid question", { status: 400 });
  }
  if (question.length > 5000) {
    return new Response("Câu hỏi quá dài (tối đa 5000 ký tự)", { status: 400 });
  }

  // Server tự chọn provider - không cho client chỉ định
  const provider = getActiveProvider();

  if (!provider) {
    return streamFallback(
      "Trợ lý AI hiện chưa khả dụng. Vui lòng thử lại sau hoặc liên hệ Trưởng phòng."
    );
  }

  // Get or create conversation
  let conversationId: string;
  if (clientConvId && typeof clientConvId === "string") {
    // Verify ownership
    const existing = await db.conversation.findFirst({
      where: { id: clientConvId, userId: user.id },
    });
    if (existing) {
      conversationId = existing.id;
    } else {
      // Invalid conversationId → tạo mới
      const title = question.length > 80 ? question.slice(0, 77) + "..." : question;
      const conv = await db.conversation.create({
        data: { userId: user.id, title },
      });
      conversationId = conv.id;
    }
  } else {
    // Tạo conversation mới với title từ câu hỏi đầu
    const title = question.length > 80 ? question.slice(0, 77) + "..." : question;
    const conv = await db.conversation.create({
      data: { userId: user.id, title },
    });
    conversationId = conv.id;
  }

  // Load lịch sử hội thoại (5 turns gần nhất)
  const history = await loadConversationHistory(conversationId);

  // Agent mode: AI tự quyết dùng tool nào (getTaskStats, searchLegalDocs, etc.)
  // Build messages: history + current question (raw)
  const messages = buildChatMessages(
    history.map((h) => ({ question: h.question, answer: h.answer })),
    question
  );

  // Sources sẽ được collect từ tool calls (nếu searchLegalDocs được gọi)
  const sources: Array<{
    documentId: string;
    documentTitle: string;
    article: string | null;
    section: string | null;
  }> = [];

  // Track tool calls để gửi UI
  const toolCallsUsed: Array<{ name: string; success: boolean }> = [];

  // Pending actions từ write tools (cần user confirm)
  const pendingActions: any[] = [];

  console.log(
    `[chat] conv=${conversationId.slice(0, 8)} | history=${history.length} | agent mode`
  );
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Gửi conversationId trước (sources sẽ update sau khi tool call)
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ conversationId })}\n\n`)
      );

      let fullAnswer = "";
      let agentSucceeded = false;

      // ====== TRY AGENT LOOP FIRST ======
      try {
        const systemPrompt = buildAgentSystemPrompt({
          name: user.name,
          role: user.role,
          position: user.position,
          teamGroupCode: user.teamGroupCode,
        });

        fullAnswer = await runAgentLoop({
          provider,
          systemPrompt,
          messages,
          ctx: {
            user: {
              id: user.id,
              role: user.role,
              name: user.name,
              teamGroupCode: user.teamGroupCode,
              department: user.department,
              managedDepartments: user.managedDepartments,
            },
          },
          maxTokens: 6000,
          onText: (text) => {
            // Stream final text từ agent
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
          },
          onToolCall: (toolName, _input) => {
            // Báo UI: đang gọi tool
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ toolCall: { name: toolName, status: "running" } })}\n\n`
              )
            );
          },
          onToolResult: (toolName, success, output) => {
            toolCallsUsed.push({ name: toolName, success });
            // Nếu searchLegalDocs → extract sources
            if (toolName === "searchLegalDocs" && success && output?.articles) {
              for (const a of output.articles) {
                sources.push({
                  documentId: a.documentTitle || "",
                  documentTitle: `${a.documentTitle} (${a.documentNumber})`,
                  article: a.article,
                  section: null,
                });
              }
              // Gửi sources update cho UI
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ sources })}\n\n`)
              );
            }
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  toolCall: { name: toolName, status: success ? "done" : "error" },
                })}\n\n`
              )
            );
          },
          onPendingAction: (action) => {
            pendingActions.push(action);
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ pendingAction: action })}\n\n`)
            );
          },
        });
        agentSucceeded = true;
      } catch (agentErr: any) {
        console.error("[chat] Agent loop failed, fallback to RAG:", agentErr?.message);
      }

      // ====== FALLBACK: RAG cũ nếu Agent fail ======
      if (!agentSucceeded) {
        try {
          // Build RAG context như cũ
          let userMsgWithContext = question;
          const articles = await retrieveWithArticleExpansion(question, 3);
          if (articles.length > 0) {
            userMsgWithContext = buildArticleGroupedMessage(question, articles);
            sources.push(...articleGroupsToSources(articles).map((s) => ({
              documentId: s.documentId,
              documentTitle: s.documentTitle,
              article: s.article,
              section: s.section,
            })));
          }
          // Send sources update
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ sources })}\n\n`)
          );

          // Rebuild messages với context cho LLM
          const fallbackMessages = buildChatMessages(
            history.map((h) => ({ question: h.question, answer: h.answer })),
            userMsgWithContext
          );

          fullAnswer = await streamChat({
            provider,
            systemPrompt: RAG_SYSTEM_PROMPT,
            messages: fallbackMessages,
            maxTokens: 6000,
            onChunk: (text) => {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
            },
          });
        } catch (fallbackErr: any) {
          const sanitized = sanitizeError(fallbackErr?.message || "");
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ text: `\n\n[${sanitized}]` })}\n\n`)
          );
          fullAnswer = `[${sanitized}]`;
        }
      }

      // ====== SAVE HISTORY ======
      try {
        await db.$transaction([
          db.chatHistory.create({
            data: {
              conversationId,
              userId: user.id,
              question,
              answer: fullAnswer,
              sources: {
                refs: sources,
                tools: toolCallsUsed,
                pendingActions,
              } as any,
            },
          }),
          db.conversation.update({
            where: { id: conversationId },
            data: { updatedAt: new Date() },
          }),
        ]);
      } catch (saveErr: any) {
        console.error("[chat] Failed to save history:", saveErr?.message);
      }

      controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

function sanitizeError(msg: string): string {
  // Loại bỏ tên SDK/provider/URL khỏi error message để không lộ thông tin
  if (/api[_-]?key|unauthorized|invalid.*key/i.test(msg)) {
    return "Lỗi xác thực dịch vụ AI. Vui lòng liên hệ Trưởng phòng.";
  }
  if (/rate.*limit|quota|429/i.test(msg)) {
    return "Đã đạt giới hạn sử dụng AI. Vui lòng thử lại sau ít phút.";
  }
  if (/timeout|network|fetch/i.test(msg)) {
    return "Lỗi kết nối tới dịch vụ AI. Vui lòng thử lại.";
  }
  return "Đã xảy ra lỗi khi xử lý câu hỏi. Vui lòng thử lại.";
}

function streamFallback(message: string) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: message })}\n\n`));
      controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}
