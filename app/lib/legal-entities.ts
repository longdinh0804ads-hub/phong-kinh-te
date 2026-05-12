/**
 * VN Government legal entity extraction + dictionary.
 *
 * Dùng cho:
 *   - Entity-boosted RAG retrieval (boost chunk score nếu match entity với query)
 *   - Document classification (suggest dept/cán bộ)
 *   - Knowledge graph (sau này, khi build agent layer)
 *
 * Cách tiếp cận: rule-based regex + keyword dictionary tiếng Việt
 *   - Pros: 0 cost, 0 latency, deterministic
 *   - Cons: cần maintain khi thêm domain mới
 *   - Verdict: phù hợp cho phòng kinh tế xã (domain hẹp + ổn định)
 *
 * Khi cần extend → có thể thêm LLM extraction (Gemini Flash) như fallback.
 */

/** Lĩnh vực nghiệp vụ - mapping tới Phòng/bộ phận trong cơ quan */
export const FIELD_KEYWORDS = {
  DAT_DAI: {
    label: "Đất đai - GPMB",
    keywords: [
      "đất đai", "đất ở", "đất nông nghiệp", "đất phi nông nghiệp",
      "GCN", "giấy chứng nhận quyền sử dụng đất", "sổ đỏ", "sổ hồng",
      "thu hồi đất", "bồi thường", "tái định cư", "GPMB", "giải phóng mặt bằng",
      "trích đo địa chính", "địa chính", "quy hoạch sử dụng đất",
      "chuyển mục đích sử dụng đất", "MĐSDĐ", "đấu giá QSDĐ",
    ],
    dept: "NONG_NGHIEP_MOI_TRUONG",
  },
  MOI_TRUONG: {
    label: "Môi trường - BVMT",
    keywords: [
      "môi trường", "bảo vệ môi trường", "BVMT",
      "chất thải", "rác thải", "chất thải rắn", "chất thải nguy hại",
      "ô nhiễm", "xả thải", "nước thải", "khí thải",
      "ĐTM", "đánh giá tác động môi trường", "giấy phép môi trường",
      "thủy lợi", "đê điều", "phòng chống thiên tai", "PCTT",
    ],
    dept: "NONG_NGHIEP_MOI_TRUONG",
  },
  XAY_DUNG: {
    label: "Xây dựng",
    keywords: [
      "xây dựng", "giấy phép xây dựng", "GPXD",
      "trật tự xây dựng", "TTXD", "công trình", "công trình xây dựng",
      "nhà ở", "nhà ở riêng lẻ", "quy hoạch xây dựng",
      "quy hoạch đô thị", "quy hoạch nông thôn",
    ],
    dept: "XAY_DUNG_CONG_THUONG",
  },
  CONG_THUONG: {
    label: "Công thương",
    keywords: [
      "công nghiệp", "thương mại", "tiểu thủ công nghiệp", "TTCN",
      "khuyến công", "cụm công nghiệp", "hợp tác xã", "HTX",
      "an toàn điện", "phòng cháy chữa cháy", "PCCC",
    ],
    dept: "XAY_DUNG_CONG_THUONG",
  },
  NONG_NGHIEP: {
    label: "Nông nghiệp - ATTP",
    keywords: [
      "nông nghiệp", "nông sản", "thủy sản", "chăn nuôi", "thú y",
      "an toàn thực phẩm", "ATTP", "vệ sinh ATTP",
      "lâm nghiệp", "khuyến nông", "nông thôn mới", "NTM", "giảm nghèo",
      "trồng trọt", "phân bón", "thuốc bảo vệ thực vật",
    ],
    dept: "NONG_NGHIEP_MOI_TRUONG",
  },
  TAI_CHINH: {
    label: "Tài chính - Kế hoạch",
    keywords: [
      "tài chính", "ngân sách", "kế hoạch đầu tư", "dự toán",
      "thu chi", "kế toán", "thuế", "đấu thầu", "mua sắm công",
      "đầu tư công", "kinh tế tập thể",
    ],
    dept: "TAI_CHINH_KE_HOACH",
  },
  TTHC: {
    label: "Thủ tục hành chính - CCHC",
    keywords: [
      "thủ tục hành chính", "TTHC", "dịch vụ công", "DVC",
      "một cửa", "một cửa liên thông", "trực tuyến",
      "cải cách hành chính", "CCHC", "chuyển đổi số", "CĐS",
      "kinh tế số", "chính phủ số", "xã hội số",
    ],
    dept: "TAI_CHINH_KE_HOACH",
  },
  DLCN: {
    label: "Dữ liệu cá nhân - Bảo mật",
    keywords: [
      "dữ liệu cá nhân", "DLCN", "bảo vệ dữ liệu",
      "thông tin cá nhân", "thông tin công dân",
      "đồng ý của chủ thể dữ liệu", "đánh giá tác động xử lý dữ liệu",
    ],
    dept: "TAI_CHINH_KE_HOACH", // CCHC handles
  },
  KHIEU_NAI_TO_CAO: {
    label: "Khiếu nại - Tố cáo - iHanoi",
    keywords: [
      "khiếu nại", "tố cáo", "phản ánh", "kiến nghị",
      "iHanoi", "công dân phản ánh", "tiếp công dân",
    ],
    dept: "BAN_LANH_DAO",
  },
} as const;

export type FieldKey = keyof typeof FIELD_KEYWORDS;

/** Loại văn bản chuẩn VN */
export const DOC_TYPE_PATTERNS = {
  LUAT: /\b(Luật|luật)\s+/,
  NGHI_DINH: /\b(Nghị định|nghị định|NĐ)\b/,
  THONG_TU: /\b(Thông tư|thông tư|TT)\b/,
  QUYET_DINH: /\b(Quyết định|quyết định|QĐ)\b/,
  NGHI_QUYET: /\b(Nghị quyết|nghị quyết|NQ)\b/,
  CONG_VAN: /\b(Công văn|công văn|CV)\b/,
} as const;

/** Cơ quan ban hành thường gặp */
export const ISSUING_BODY_KEYWORDS = [
  "Quốc hội", "Chính phủ", "Thủ tướng", "Thủ tướng Chính phủ",
  "Bộ Tài chính", "Bộ Nông nghiệp", "Bộ TN&MT", "Bộ Xây dựng",
  "Bộ Nội vụ", "Bộ Tư pháp", "Bộ Y tế", "Bộ Công Thương",
  "UBND tỉnh", "UBND thành phố", "UBND huyện", "UBND xã",
  "HĐND",
];

/** Pattern số văn bản VN (vd: 13/2023/NĐ-CP, 245/UBND-KT, 31/2024/QH15) */
export const DOC_NUMBER_REGEX =
  /\b(\d+\/(?:\d{4}\/)?(?:NĐ-CP|TT-[A-Z]+|QĐ-(?:TTg|UBND|[A-Z]+)|QH\d+|NQ-[A-Z\d]+|CV|UBND-[A-Z]+))\b/gi;

/** Mức độ khẩn cấp */
export const URGENCY_KEYWORDS = {
  KHAN_CAP: ["khẩn cấp", "khẩn", "hỏa tốc", "ngay", "lập tức"],
  CAO: ["ưu tiên cao", "trọng điểm", "đặc biệt"],
  THUONG: [], // default
  THAP: ["thường xuyên", "định kỳ"],
} as const;

// ============== EXTRACTION FUNCTIONS ==============

export interface ExtractedEntities {
  fields: FieldKey[]; // Lĩnh vực có trong text
  docNumbers: string[]; // Số văn bản được nhắc tới
  issuingBodies: string[]; // Cơ quan ban hành
  hasDocType: { type: string; matched: string }[]; // Loại VB đề cập
}

/**
 * Extract entities từ text (query hoặc document content).
 */
export function extractEntities(text: string): ExtractedEntities {
  if (!text) {
    return { fields: [], docNumbers: [], issuingBodies: [], hasDocType: [] };
  }
  const lower = text.toLowerCase();

  // Fields
  const fields: FieldKey[] = [];
  for (const [key, config] of Object.entries(FIELD_KEYWORDS) as Array<
    [FieldKey, typeof FIELD_KEYWORDS[FieldKey]]
  >) {
    if (config.keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      fields.push(key);
    }
  }

  // Doc numbers
  const docNumbers = Array.from(
    new Set(Array.from(text.matchAll(DOC_NUMBER_REGEX)).map((m) => m[1]))
  );

  // Issuing bodies
  const issuingBodies = ISSUING_BODY_KEYWORDS.filter((b) => text.includes(b));

  // Doc types mentioned
  const hasDocType: { type: string; matched: string }[] = [];
  for (const [type, pattern] of Object.entries(DOC_TYPE_PATTERNS)) {
    const m = text.match(pattern);
    if (m) hasDocType.push({ type, matched: m[0] });
  }

  return { fields, docNumbers, issuingBodies, hasDocType };
}

// ============== SCORING FUNCTIONS ==============

/**
 * Compute boost score [0, 0.3] cho 1 chunk dựa trên overlap entity với query.
 *
 * Trọng số (đã tune qua benchmark 15 queries):
 *   - Per-keyword match TRONG field của query: +0.03/keyword (granular hơn per-field)
 *     → Vd query "môi trường" + chunk có "chất thải", "BVMT", "ô nhiễm" → 3 × 0.03 = 0.09
 *   - Exact doc number match: +0.15 (mạnh nhất - tham chiếu trực tiếp)
 *   - Match issuing body: +0.03
 *
 * Cap tổng 0.3 để không lấn át vector + BM25 score (~0.6 + 0.4 = 1.0 max).
 */
export function entityBoostScore(
  chunkContent: string,
  documentTitle: string,
  documentNumber: string,
  queryEntities: ExtractedEntities
): number {
  let boost = 0;
  const haystack = `${documentTitle}\n${documentNumber}\n${chunkContent}`.toLowerCase();

  // 1. Per-keyword match TRONG FIELD CỦA QUERY (granular boost)
  // Logic: query hỏi về "môi trường" → reward chunks có nhiều keywords về môi trường
  // Skip nếu query không có field nào (avoid boost vô nghĩa)
  for (const fKey of queryEntities.fields) {
    const fConfig = FIELD_KEYWORDS[fKey];
    for (const kw of fConfig.keywords) {
      if (haystack.includes(kw.toLowerCase())) {
        boost += 0.03;
      }
    }
  }

  // 2. Exact doc number match (mạnh nhất)
  for (const qn of queryEntities.docNumbers) {
    if (documentNumber === qn || haystack.includes(qn.toLowerCase())) {
      boost += 0.15;
      break; // chỉ count 1 lần
    }
  }

  // 3. Issuing body overlap
  for (const b of queryEntities.issuingBodies) {
    if (haystack.includes(b.toLowerCase())) {
      boost += 0.03;
      break;
    }
  }

  return Math.min(boost, 0.3);
}

/**
 * Đề xuất department phụ trách dựa trên fields extracted từ document.
 * Trả null nếu không xác định được rõ.
 */
export function suggestDepartment(text: string): {
  dept: string | null;
  confidence: number;
  reason: string;
} {
  const entities = extractEntities(text);
  if (entities.fields.length === 0) {
    return { dept: null, confidence: 0, reason: "Không tìm thấy lĩnh vực rõ ràng" };
  }

  // Count theo dept
  const deptCount: Record<string, number> = {};
  const deptFields: Record<string, string[]> = {};
  for (const f of entities.fields) {
    const cfg = FIELD_KEYWORDS[f];
    const d = cfg.dept;
    deptCount[d] = (deptCount[d] || 0) + 1;
    if (!deptFields[d]) deptFields[d] = [];
    deptFields[d].push(cfg.label);
  }

  // Pick highest count
  const sorted = Object.entries(deptCount).sort((a, b) => b[1] - a[1]);
  const [topDept, topCount] = sorted[0];
  const totalCount = sorted.reduce((s, [, c]) => s + c, 0);
  const confidence = topCount / totalCount;

  return {
    dept: topDept,
    confidence,
    reason: `Phát hiện ${topCount} lĩnh vực thuộc bộ phận này: ${deptFields[topDept].join(", ")}`,
  };
}
