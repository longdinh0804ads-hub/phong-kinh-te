// AI tool: Legal deep research với multi-hop reasoning + citations.
// Khác searchLegalDocs (basic retrieval) - tool này TỰ TỔNG HỢP CÂU TRẢ LỜI.

import { z } from "zod";
import type { ToolDefinition } from "../types";
import { answerLegalQuery } from "@/lib/ai-agents/legal-researcher";

const inputSchema = z.object({
  query: z.string().min(10).max(500),
});

export const legalDeepResearchTool: ToolDefinition = {
  name: "legalDeepResearch",
  description:
    "Tra cứu pháp lý NÂNG CAO: phân tích câu hỏi phức tạp (multi-hop), tổng hợp câu trả lời với trích dẫn cụ thể từ nhiều văn bản. Dùng khi user hỏi câu cần SO SÁNH, TỔNG HỢP, hoặc liên quan nhiều văn bản. Khác searchLegalDocs (chỉ trả chunks).",
  type: "read",
  inputSchema,
  jsonSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Câu hỏi pháp lý phức tạp (≥10 ký tự). Ví dụ: 'So sánh trách nhiệm UBND xã về môi trường và ATTP'",
      },
    },
    required: ["query"],
  },
  async execute(input) {
    const result = await answerLegalQuery(input.query);
    return {
      query: input.query,
      answer: result.answer,
      citations: result.citations.map((c, i) => ({
        index: i + 1,
        docNumber: c.docNumber,
        docTitle: c.docTitle,
        article: c.article,
        excerpt: c.excerpt,
      })),
      subQueries: result.subQueries,
      confidence: result.confidence,
      warnings: result.warnings,
    };
  },
};
