// Conversation context management cho RAG chat.
// Detect follow-up questions để REUSE chunks thay vì retrieve lại,
// load history để pass cho LLM dạng multi-turn.

import { db } from "./db";
import type { ChatMessage } from "./ai";

/** Số tin nhắn trước cùng conversation được load làm context */
const HISTORY_TURNS_LIMIT = 5; // 5 cặp Q-A gần nhất
/** Cap độ dài 1 answer cũ để không tràn token */
const MAX_PREV_ANSWER_CHARS = 2500;

// Cụm từ chỉ follow-up question. KHÔNG dùng \b vì \b không xử lý đúng Unicode tiếng Việt.
const FOLLOWUP_PATTERNS = [
  // Tóm tắt/rút gọn
  /^\s*tóm\s*tắt/i,
  /(rút\s*gọn|ngắn\s*gọn|gọn\s*lại|ngắn\s*hơn)/i,
  /chỉ\s+(các\s+)?ý\s+chính/i,
  /những\s+ý\s+chính/i,
  /ý\s+chính\s*(thôi)?/i,
  // Mở rộng/giải thích
  /(giải\s*thích|làm\s*rõ|nói\s*rõ|cụ\s*thể\s*hơn|chi\s*tiết\s*hơn)/i,
  /ví\s*dụ/i,
  // Tham chiếu tin nhắn trước
  /^\s*(vậy|thế|còn|nó|cái\s*đó|điều\s*đó|cái\s*này)\s/i,
  /(theo\s+đó|nói\s+thêm|liệt\s+kê\s+thêm|kể\s+thêm)/i,
  // Đại từ chỉ ngữ cảnh
  /^\s*(còn|nhưng|vậy|thế)\s+/i,
];

/**
 * Heuristic detect câu hỏi follow-up.
 * - Có từ khóa follow-up: "tóm tắt", "ngắn hơn", "giải thích thêm", "ví dụ"...
 * - HOẶC quá ngắn (< 5 từ) trong context có history
 */
export function isFollowUpQuestion(question: string, hasHistory: boolean): boolean {
  if (!hasHistory) return false;
  const q = question.trim();
  if (q.length === 0) return false;

  // Check patterns
  for (const re of FOLLOWUP_PATTERNS) {
    if (re.test(q)) return true;
  }

  // Câu cực ngắn (≤ 4 từ) trong cuộc hội thoại đang diễn ra → coi như follow-up
  const wordCount = q.split(/\s+/).filter((w) => w.length > 0).length;
  if (wordCount <= 4) return true;

  return false;
}

/**
 * Load lịch sử hội thoại của 1 conversation (sort cũ → mới).
 */
export async function loadConversationHistory(
  conversationId: string,
  limit = HISTORY_TURNS_LIMIT
): Promise<Array<{ question: string; answer: string; sources: any }>> {
  const rows = await db.chatHistory.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { question: true, answer: true, sources: true, createdAt: true },
  });
  return rows.reverse(); // chronological
}

/**
 * Build messages array cho LLM với history.
 * Trim answer cũ nếu quá dài để tiết kiệm token.
 */
export function buildChatMessages(
  history: Array<{ question: string; answer: string }>,
  currentUserMessage: string
): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const h of history) {
    messages.push({ role: "user", content: h.question });
    const trimmedAnswer =
      h.answer.length > MAX_PREV_ANSWER_CHARS
        ? h.answer.slice(0, MAX_PREV_ANSWER_CHARS) + "\n[...nội dung được rút gọn...]"
        : h.answer;
    messages.push({ role: "assistant", content: trimmedAnswer });
  }
  messages.push({ role: "user", content: currentUserMessage });
  return messages;
}

/**
 * Lấy chunks từ source refs lưu trong chatHistory cũ.
 * Refs có dạng: { documentId, article, section } hoặc string array.
 * Nếu không tìm được, trả mảng rỗng.
 */
export async function getChunksFromPreviousSources(
  prevSources: any
): Promise<
  Array<{
    id: string;
    documentId: string;
    documentTitle: string;
    documentNumber: string;
    documentType: string;
    article: string | null;
    section: string | null;
    content: string;
  }>
> {
  if (!prevSources) return [];
  // sources có thể là { _provider, refs } hoặc array thuần
  const refs = Array.isArray(prevSources)
    ? prevSources
    : prevSources.refs || prevSources;
  if (!Array.isArray(refs) || refs.length === 0) return [];

  // Pull chunks dựa trên (documentId, article) — không cần section vì sẽ pull full Điều
  // Dedupe theo (documentId, article)
  const seen = new Set<string>();
  const filters: Array<{ documentId: string; article: string | null }> = [];
  for (const r of refs) {
    if (!r || !r.documentId) continue;
    const key = `${r.documentId}::${r.article || "null"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    filters.push({ documentId: r.documentId, article: r.article || null });
  }

  if (filters.length === 0) return [];

  // Pull all chunks of those (doc, article) combos
  const all: Array<{
    id: string;
    documentId: string;
    documentTitle: string;
    documentNumber: string;
    documentType: string;
    article: string | null;
    section: string | null;
    content: string;
  }> = [];

  for (const f of filters) {
    const dbChunks = await db.legalChunk.findMany({
      where: {
        documentId: f.documentId,
        article: f.article,
        document: { status: "active" },
      },
      orderBy: { chunkIndex: "asc" },
      include: {
        document: {
          select: { title: true, docType: true, docNumber: true },
        },
      },
    });
    for (const c of dbChunks) {
      all.push({
        id: c.id,
        documentId: c.documentId,
        documentTitle: c.document.title,
        documentNumber: c.document.docNumber,
        documentType: c.document.docType,
        article: c.article,
        section: c.section,
        content: c.content,
      });
    }
  }

  return all;
}
