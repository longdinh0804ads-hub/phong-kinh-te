// Test RAG retrieval logic
import { retrieveRelevantChunks, buildRAGPrompt } from "../lib/rag";

async function main() {
  const queries = [
    "Thủ tục cấp giấy chứng nhận quyền sử dụng đất ở lần đầu cần giấy tờ gì?",
    "Chuyển mục đích sử dụng đất mất bao nhiêu ngày?",
    "Đính chính sai sót giấy chứng nhận như thế nào?",
    "Cấp phép xây dựng nhà ở nông thôn",
  ];

  for (const q of queries) {
    console.log(`\n🔍 Câu hỏi: ${q}`);
    const chunks = await retrieveRelevantChunks(q, 3);
    if (chunks.length === 0) {
      console.log("  ❌ Không tìm thấy chunk liên quan");
    } else {
      console.log(`  ✅ Tìm được ${chunks.length} chunk:`);
      for (const c of chunks) {
        console.log(`    - [${c.score.toFixed(2)}] ${c.article || "?"}: ${c.content.slice(0, 60)}...`);
      }
    }
  }

  process.exit(0);
}

main();
