// AI tool: Search Legal documents (wrap hybrid RAG).

import { z } from "zod";
import type { ToolDefinition } from "../types";
import { retrieveWithArticleExpansion } from "@/lib/rag-article-expansion";

const legalInput = z.object({
  query: z.string().min(3).max(500),
});

export const searchLegalDocsTool: ToolDefinition = {
  name: "searchLegalDocs",
  description:
    "Tra cứu văn bản pháp luật (nghị định, thông tư, quyết định, luật) liên quan đến đất đai, xây dựng, môi trường, công thương, nông nghiệp, tài chính. Dùng khi user hỏi về quy định pháp luật cụ thể.",
  type: "read",
  inputSchema: legalInput,
  jsonSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Câu hỏi hoặc từ khóa tra cứu (vd: 'chức năng của sở', 'thủ tục cấp GCN')",
      },
    },
    required: ["query"],
  },
  async execute(input) {
    const articles = await retrieveWithArticleExpansion(input.query, 3);
    return {
      query: input.query,
      articleCount: articles.length,
      articles: articles.map((a) => ({
        documentTitle: a.documentTitle,
        documentNumber: a.documentNumber,
        article: a.article,
        // Gộp content của tất cả khoản trong điều thành 1 đoạn
        content: a.chunks.map((c) => c.content).join("\n"),
        matchedCount: a.matchedCount,
      })),
    };
  },
};
