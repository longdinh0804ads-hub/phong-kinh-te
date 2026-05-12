/**
 * Benchmark 3 retrieval strategies trên 15 query đại diện:
 *   A. Hybrid RAG (hiện tại) - vector cosine + BM25
 *   B. Entity-boosted RAG - thêm entity match score
 *   C. KG-aware RAG (LightRAG-style) - multi-hop traversal qua KG
 *
 * Metrics:
 *   - Recall@K: trong top-K, có bao nhiêu chunks "gold" được trả về
 *   - MRR: Mean Reciprocal Rank - chunk đầu tiên đúng ở vị trí nào
 *   - Latency: thời gian thực thi
 *   - Token cost: ước tính
 *
 * Gold standard: chunks được tag thủ công là "phải xuất hiện" cho query đó.
 */
import * as fs from "fs";
import * as path from "path";
for (const envName of [".env", ".env.local"]) {
  const f = path.join(__dirname, "..", envName);
  if (fs.existsSync(f))
    for (const line of fs.readFileSync(f, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) {
        let v = m[2].trim();
        if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
        process.env[m[1]] = v;
      }
    }
}

import { PrismaClient } from "@prisma/client";
import { retrieveHybrid } from "../lib/rag-hybrid";
import { retrieveEntityBoosted } from "../lib/rag-entity-boosted";
import { embedText, vectorToSql, isEmbeddingAvailable } from "../lib/embeddings";

const db = new PrismaClient();

// ====================== TEST QUERIES + GOLD STANDARD ======================
// docNumber + article = gold chunk identifier
interface TestQuery {
  id: string;
  category: "intake_dispatch" | "summary_speech";
  query: string;
  gold: Array<{ docNumber: string; article: string }>;
  // multiHop = true → query cần liên kết >=2 văn bản
  multiHop: boolean;
}

const QUERIES: TestQuery[] = [
  // ============ NHÓM 1: TIẾP NHẬN VB + GIAO VIỆC (50%) ============
  {
    id: "q01",
    category: "intake_dispatch",
    query: "Có văn bản nào về quản lý chất thải rắn sinh hoạt ở cấp xã không?",
    gold: [{ docNumber: "08/2022/NĐ-CP", article: "Điều 26" }],
    multiHop: false,
  },
  {
    id: "q02",
    category: "intake_dispatch",
    query: "Cấp giấy phép xây dựng nhà ở riêng lẻ thuộc thẩm quyền nào",
    gold: [{ docNumber: "62/2020/QH14", article: "Điều 89" }],
    multiHop: false,
  },
  {
    id: "q03",
    category: "intake_dispatch",
    query: "UBND xã có trách nhiệm gì về an toàn thực phẩm",
    gold: [{ docNumber: "38/2018/TT-BNNPTNT", article: "Điều 8" }],
    multiHop: false,
  },
  {
    id: "q04",
    category: "intake_dispatch",
    query: "Thủ tục cấp giấy chứng nhận quyền sử dụng đất cho hộ gia đình",
    gold: [{ docNumber: "31/2024/QH15", article: "Điều 122" }],
    multiHop: false,
  },
  {
    id: "q05",
    category: "intake_dispatch",
    query: "Công văn 245/UBND-KT yêu cầu Phòng Kinh Tế làm gì",
    gold: [{ docNumber: "245/UBND-KT", article: "" }],
    multiHop: false,
  },
  {
    id: "q06",
    category: "intake_dispatch",
    query: "Cán bộ phụ trách lĩnh vực nông nghiệp - môi trường cần triển khai kiểm tra theo các văn bản nào",
    gold: [
      { docNumber: "08/2022/NĐ-CP", article: "Điều 32" },
      { docNumber: "38/2018/TT-BNNPTNT", article: "Điều 12" },
      { docNumber: "245/UBND-KT", article: "" },
    ],
    multiHop: true,
  },
  {
    id: "q07",
    category: "intake_dispatch",
    query: "Khi xử lý hồ sơ TTHC mà công dân yêu cầu cung cấp dữ liệu cá nhân thì cần tuân thủ quy định nào",
    gold: [
      { docNumber: "45/2020/NĐ-CP", article: "Điều 9" },
      { docNumber: "13/2023/NĐ-CP", article: "Điều 11" },
    ],
    multiHop: true,
  },
  {
    id: "q08",
    category: "intake_dispatch",
    query: "Phòng Kinh Tế xã chịu trách nhiệm gì về quản lý trật tự xây dựng",
    gold: [{ docNumber: "62/2020/QH14", article: "Điều 102" }],
    multiHop: false,
  },

  // ============ NHÓM 2: TỔNG HỢP + VIẾT BÁO CÁO/BÀI PHÁT BIỂU (50%) ============
  {
    id: "q09",
    category: "summary_speech",
    query: "Tổng hợp các văn bản pháp lý cấp xã phải thực hiện về bảo vệ môi trường",
    gold: [
      { docNumber: "08/2022/NĐ-CP", article: "Điều 26" },
      { docNumber: "08/2022/NĐ-CP", article: "Điều 32" },
      { docNumber: "245/UBND-KT", article: "" },
    ],
    multiHop: true,
  },
  {
    id: "q10",
    category: "summary_speech",
    query: "Viết bài phát biểu sơ kết công tác CCHC và chuyển đổi số tại xã, có dẫn chiếu văn bản",
    gold: [
      { docNumber: "749/QĐ-TTg", article: "Điều 1" },
      { docNumber: "45/2020/NĐ-CP", article: "Điều 9" },
      { docNumber: "45/2020/NĐ-CP", article: "Điều 18" },
    ],
    multiHop: true,
  },
  {
    id: "q11",
    category: "summary_speech",
    query: "Báo cáo trách nhiệm UBND xã trong việc thu hồi đất và bồi thường GPMB",
    gold: [
      { docNumber: "31/2024/QH15", article: "Điều 79" },
      { docNumber: "31/2024/QH15", article: "Điều 90" },
    ],
    multiHop: true,
  },
  {
    id: "q12",
    category: "summary_speech",
    query: "Bài phát biểu về kiểm tra liên ngành ATTP tại các cơ sở nông sản",
    gold: [
      { docNumber: "38/2018/TT-BNNPTNT", article: "Điều 12" },
      { docNumber: "38/2018/TT-BNNPTNT", article: "Điều 8" },
    ],
    multiHop: false,
  },
  {
    id: "q13",
    category: "summary_speech",
    query: "So sánh trách nhiệm quản lý chất thải giữa UBND xã và Phòng Kinh Tế theo các nghị định hiện hành",
    gold: [
      { docNumber: "08/2022/NĐ-CP", article: "Điều 26" },
      { docNumber: "08/2022/NĐ-CP", article: "Điều 32" },
    ],
    multiHop: true,
  },
  {
    id: "q14",
    category: "summary_speech",
    query: "Tổng hợp các quy định về đánh giá tác động khi cơ quan nhà nước xử lý dữ liệu công dân",
    gold: [
      { docNumber: "13/2023/NĐ-CP", article: "Điều 24" },
      { docNumber: "13/2023/NĐ-CP", article: "Điều 30" },
    ],
    multiHop: true,
  },
  {
    id: "q15",
    category: "summary_speech",
    query: "Viết bài phát biểu khai mạc hội nghị triển khai văn bản UBND xã giao về bảo vệ môi trường, dẫn chiếu các văn bản pháp lý liên quan",
    gold: [
      { docNumber: "245/UBND-KT", article: "" },
      { docNumber: "08/2022/NĐ-CP", article: "Điều 26" },
      { docNumber: "38/2018/TT-BNNPTNT", article: "Điều 12" },
      { docNumber: "749/QĐ-TTg", article: "Điều 1" },
    ],
    multiHop: true,
  },
];

// ====================== HELPERS ======================
function isMatch(chunk: { docNumber?: string; documentNumber?: string; article: string | null }, gold: { docNumber: string; article: string }): boolean {
  const dn = chunk.documentNumber || chunk.docNumber || "";
  if (dn !== gold.docNumber) return false;
  // Nếu gold.article rỗng → match mọi chunk của doc đó
  if (!gold.article) return true;
  return (chunk.article || "").includes(gold.article);
}

interface Metrics {
  recall5: number;
  recall10: number;
  mrr: number;
  precisionTop3: number;
  latencyMs: number;
  hits: number;
  total: number;
}

function scoreResults(
  retrieved: Array<{ documentNumber?: string; docNumber?: string; article: string | null; content: string }>,
  gold: Array<{ docNumber: string; article: string }>,
  latencyMs: number
): Metrics {
  const top5 = retrieved.slice(0, 5);
  const top10 = retrieved.slice(0, 10);
  const top3 = retrieved.slice(0, 3);

  let hits5 = 0;
  let hits10 = 0;
  let hits3 = 0;
  let firstHitRank = -1;

  for (const g of gold) {
    const idx10 = top10.findIndex((r) => isMatch(r as any, g));
    if (idx10 >= 0) {
      hits10++;
      if (idx10 < 5) hits5++;
      if (idx10 < 3) hits3++;
      if (firstHitRank === -1 || idx10 < firstHitRank) firstHitRank = idx10;
    }
  }

  return {
    recall5: hits5 / gold.length,
    recall10: hits10 / gold.length,
    mrr: firstHitRank >= 0 ? 1 / (firstHitRank + 1) : 0,
    precisionTop3: hits3 / 3,
    latencyMs,
    hits: hits10,
    total: gold.length,
  };
}

// ====================== RETRIEVER A: Hybrid RAG hiện tại ======================
async function retrieverA(query: string, topK: number) {
  const start = Date.now();
  const results = await retrieveHybrid(query, topK);
  return { results, latencyMs: Date.now() - start };
}

// ====================== RETRIEVER B: Entity-boosted ======================
// Idea: extract entities từ query (lĩnh vực, số văn bản, từ khóa), boost chunks có match entity
const ENTITY_KEYWORDS = {
  "đất đai": ["đất", "GCN", "thu hồi", "bồi thường", "giải phóng mặt bằng", "GPMB"],
  "môi trường": ["môi trường", "chất thải", "ô nhiễm", "BVMT", "ĐTM"],
  "xây dựng": ["xây dựng", "giấy phép", "trật tự xây dựng", "công trình"],
  "ATTP": ["thực phẩm", "ATTP", "an toàn thực phẩm", "nông sản"],
  "TTHC": ["thủ tục hành chính", "TTHC", "dịch vụ công", "một cửa"],
  "DLCN": ["dữ liệu cá nhân", "DLCN", "bảo vệ dữ liệu"],
  "CCHC": ["chuyển đổi số", "CCHC", "cải cách hành chính", "kinh tế số"],
};

function extractQueryEntities(query: string): string[] {
  const q = query.toLowerCase();
  const found: string[] = [];
  for (const [entity, keywords] of Object.entries(ENTITY_KEYWORDS)) {
    if (keywords.some((k) => q.includes(k.toLowerCase()))) found.push(entity);
  }
  return found;
}

function entityScoreBoost(content: string, entities: string[]): number {
  const lc = content.toLowerCase();
  let score = 0;
  for (const e of entities) {
    const kws = ENTITY_KEYWORDS[e as keyof typeof ENTITY_KEYWORDS] || [];
    for (const k of kws) {
      if (lc.includes(k.toLowerCase())) score += 0.05;
    }
  }
  return Math.min(score, 0.3); // cap boost at +0.3
}

async function retrieverB(query: string, topK: number) {
  const start = Date.now();
  // Dùng production function: retrieveEntityBoosted (VN-specific dictionary
  // mạnh hơn so với inline ENTITY_KEYWORDS ở dưới)
  const results = await retrieveEntityBoosted(query, topK);
  return { results, latencyMs: Date.now() - start };
}

// ====================== RETRIEVER C: KG-aware (LightRAG-style mini) ======================
// Build mini KG: extract relations từ chunks (cite văn bản khác, đề cập lĩnh vực)
// Trên query, expand qua KG để lấy related docs

interface MiniRelation {
  fromDoc: string; // docNumber
  toDoc: string;
  type: "cites" | "supersedes";
}

// Hardcoded KG cho demo - production sẽ extract qua LLM
// Quan hệ trích từ nội dung văn bản (cite)
const KG_RELATIONS: MiniRelation[] = [
  // Công văn 245 cites 3 văn bản
  { fromDoc: "245/UBND-KT", toDoc: "08/2022/NĐ-CP", type: "cites" },
  { fromDoc: "245/UBND-KT", toDoc: "38/2018/TT-BNNPTNT", type: "cites" },
  { fromDoc: "245/UBND-KT", toDoc: "749/QĐ-TTg", type: "cites" },
  // NĐ 45 (TTHC) liên quan NĐ 13 (DLCN) khi xử lý hồ sơ
  { fromDoc: "45/2020/NĐ-CP", toDoc: "13/2023/NĐ-CP", type: "cites" },
  // NĐ 08 môi trường liên quan TT 38 ATTP (kiểm tra chung)
  { fromDoc: "08/2022/NĐ-CP", toDoc: "38/2018/TT-BNNPTNT", type: "cites" },
];

// Map entity → docNumbers
const ENTITY_TO_DOCS: Record<string, string[]> = {
  "đất đai": ["31/2024/QH15"],
  "môi trường": ["08/2022/NĐ-CP", "245/UBND-KT"],
  "xây dựng": ["62/2020/QH14"],
  "ATTP": ["38/2018/TT-BNNPTNT"],
  "TTHC": ["45/2020/NĐ-CP"],
  "DLCN": ["13/2023/NĐ-CP"],
  "CCHC": ["749/QĐ-TTg", "45/2020/NĐ-CP"],
};

async function retrieverC(query: string, topK: number) {
  const start = Date.now();

  // 1. Vector + BM25 candidate (mở rộng pool)
  const baseResults = await retrieveHybrid(query, topK * 2);

  // 2. Entity extraction từ query
  const entities = extractQueryEntities(query);

  // 3. Tìm các docNumber liên quan qua entity → docs map
  const seedDocs = new Set<string>();
  for (const e of entities) (ENTITY_TO_DOCS[e] || []).forEach((d) => seedDocs.add(d));

  // 4. KG traversal: từ seed docs, expand qua cites (1-hop)
  for (const doc of Array.from(seedDocs)) {
    for (const rel of KG_RELATIONS) {
      if (rel.fromDoc === doc) seedDocs.add(rel.toDoc);
      if (rel.toDoc === doc) seedDocs.add(rel.fromDoc); // reverse
    }
  }

  // 5. Pull thêm chunks từ KG-expanded docs (boost score)
  let kgChunks: any[] = [];
  if (seedDocs.size > 0) {
    const docs = await db.legalDocument.findMany({
      where: { docNumber: { in: Array.from(seedDocs) }, status: "active" },
      include: { chunks: { take: 3 } }, // 3 chunks/doc đại diện
    });
    kgChunks = docs.flatMap((d) =>
      d.chunks.map((c) => ({
        id: c.id,
        documentId: d.id,
        documentTitle: d.title,
        documentType: d.docType,
        documentNumber: d.docNumber,
        article: c.article,
        section: c.section,
        content: c.content,
        score: 0.5, // base KG score
        _source: "kg",
      }))
    );
  }

  // 6. Merge: base RAG + KG chunks, dedup by id, boost KG entity match
  const merged = new Map<string, any>();
  for (const r of baseResults) {
    merged.set(r.id, { ...r, score: r.score + 0.1 }); // base score
  }
  for (const kg of kgChunks) {
    const existing = merged.get(kg.id);
    if (existing) {
      // Đã có từ vector → boost vì KG xác nhận relevance
      merged.set(kg.id, { ...existing, score: existing.score + 0.25 });
    } else {
      // Chỉ có từ KG → giữ với score thấp hơn để vector vẫn lead
      merged.set(kg.id, kg);
    }
  }

  // 7. Entity boost (như retrieverB)
  const results = Array.from(merged.values())
    .map((c) => ({ ...c, score: c.score + entityScoreBoost(c.content, entities) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return { results, latencyMs: Date.now() - start };
}

// ====================== RUN BENCHMARK ======================
async function main() {
  if (!isEmbeddingAvailable()) {
    console.error("Embedding chưa khả dụng - cần GEMINI_API_KEY trong env");
    process.exit(1);
  }

  console.log(`\n${"═".repeat(70)}`);
  console.log("BENCHMARK RAG: 3 strategies × 15 queries × 8 văn bản");
  console.log("═".repeat(70));

  type StratResult = { name: string; metrics: Metrics[]; totalLatency: number };
  const strategies: StratResult[] = [
    { name: "A. Hybrid RAG (current)", metrics: [], totalLatency: 0 },
    { name: "B. Entity-boosted", metrics: [], totalLatency: 0 },
    { name: "C. KG-aware (LightRAG-mini)", metrics: [], totalLatency: 0 },
  ];

  const K = 10;

  for (const q of QUERIES) {
    console.log(`\n[${q.id}] (${q.category}, multiHop=${q.multiHop}) "${q.query.slice(0, 70)}..."`);
    console.log(`     Gold: ${q.gold.map((g) => `${g.docNumber}${g.article ? "/" + g.article : ""}`).join(", ")}`);

    const a = await retrieverA(q.query, K);
    const ma = scoreResults(a.results as any, q.gold, a.latencyMs);
    strategies[0].metrics.push(ma);
    strategies[0].totalLatency += ma.latencyMs;

    const b = await retrieverB(q.query, K);
    const mb = scoreResults(b.results as any, q.gold, b.latencyMs);
    strategies[1].metrics.push(mb);
    strategies[1].totalLatency += mb.latencyMs;

    const c = await retrieverC(q.query, K);
    const mc = scoreResults(c.results as any, q.gold, c.latencyMs);
    strategies[2].metrics.push(mc);
    strategies[2].totalLatency += mc.latencyMs;

    console.log(`     A: hits=${ma.hits}/${ma.total} recall@5=${(ma.recall5 * 100).toFixed(0)}% MRR=${ma.mrr.toFixed(2)} ${ma.latencyMs}ms`);
    console.log(`     B: hits=${mb.hits}/${mb.total} recall@5=${(mb.recall5 * 100).toFixed(0)}% MRR=${mb.mrr.toFixed(2)} ${mb.latencyMs}ms`);
    console.log(`     C: hits=${mc.hits}/${mc.total} recall@5=${(mc.recall5 * 100).toFixed(0)}% MRR=${mc.mrr.toFixed(2)} ${mc.latencyMs}ms`);
  }

  // ====== Aggregate ======
  console.log(`\n${"═".repeat(70)}`);
  console.log("TỔNG KẾT");
  console.log("═".repeat(70));

  const aggregate = (m: Metrics[], filter?: (q: TestQuery, i: number) => boolean) => {
    const filtered = filter ? m.filter((_, i) => filter(QUERIES[i], i)) : m;
    if (filtered.length === 0) return null;
    const sum = (k: keyof Metrics) => filtered.reduce((s, x) => s + (x[k] as number), 0);
    return {
      recall5: (sum("recall5") / filtered.length) * 100,
      recall10: (sum("recall10") / filtered.length) * 100,
      mrr: sum("mrr") / filtered.length,
      latency: sum("latencyMs") / filtered.length,
      count: filtered.length,
    };
  };

  console.log("\nOVERALL (15 queries):");
  console.log("│ Strategy                       │ Recall@5 │ Recall@10│ MRR    │ Avg lat │");
  console.log("├────────────────────────────────┼──────────┼──────────┼────────┼─────────┤");
  for (const s of strategies) {
    const agg = aggregate(s.metrics)!;
    console.log(`│ ${s.name.padEnd(31)}│ ${agg.recall5.toFixed(1).padStart(6)}%  │ ${agg.recall10.toFixed(1).padStart(6)}%  │ ${agg.mrr.toFixed(3)} │ ${agg.latency.toFixed(0).padStart(5)}ms │`);
  }

  console.log("\nINTAKE + DISPATCH queries (q01-q08, 8 queries):");
  console.log("│ Strategy                       │ Recall@5 │ Recall@10│ MRR    │");
  console.log("├────────────────────────────────┼──────────┼──────────┼────────┤");
  for (const s of strategies) {
    const agg = aggregate(s.metrics, (q) => q.category === "intake_dispatch")!;
    console.log(`│ ${s.name.padEnd(31)}│ ${agg.recall5.toFixed(1).padStart(6)}%  │ ${agg.recall10.toFixed(1).padStart(6)}%  │ ${agg.mrr.toFixed(3)} │`);
  }

  console.log("\nSUMMARY + SPEECH queries (q09-q15, 7 queries):");
  console.log("│ Strategy                       │ Recall@5 │ Recall@10│ MRR    │");
  console.log("├────────────────────────────────┼──────────┼──────────┼────────┤");
  for (const s of strategies) {
    const agg = aggregate(s.metrics, (q) => q.category === "summary_speech")!;
    console.log(`│ ${s.name.padEnd(31)}│ ${agg.recall5.toFixed(1).padStart(6)}%  │ ${agg.recall10.toFixed(1).padStart(6)}%  │ ${agg.mrr.toFixed(3)} │`);
  }

  console.log("\nMULTI-HOP queries (queries requiring 2+ docs):");
  console.log("│ Strategy                       │ Recall@5 │ Recall@10│ MRR    │");
  console.log("├────────────────────────────────┼──────────┼──────────┼────────┤");
  for (const s of strategies) {
    const agg = aggregate(s.metrics, (q) => q.multiHop)!;
    console.log(`│ ${s.name.padEnd(31)}│ ${agg.recall5.toFixed(1).padStart(6)}%  │ ${agg.recall10.toFixed(1).padStart(6)}%  │ ${agg.mrr.toFixed(3)} │`);
  }

  console.log("\nSINGLE-HOP queries:");
  console.log("│ Strategy                       │ Recall@5 │ Recall@10│ MRR    │");
  console.log("├────────────────────────────────┼──────────┼──────────┼────────┤");
  for (const s of strategies) {
    const agg = aggregate(s.metrics, (q) => !q.multiHop)!;
    console.log(`│ ${s.name.padEnd(31)}│ ${agg.recall5.toFixed(1).padStart(6)}%  │ ${agg.recall10.toFixed(1).padStart(6)}%  │ ${agg.mrr.toFixed(3)} │`);
  }

  console.log(`\n${"═".repeat(70)}\n`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("FAIL:", e);
  await db.$disconnect();
  process.exit(1);
});
