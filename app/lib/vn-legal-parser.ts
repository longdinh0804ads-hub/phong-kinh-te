// Parser metadata cho văn bản pháp luật VN từ text trích xuất từ PDF.
// Detect: docType, docNumber, title, issuedDate, effectiveDate

export type VNDocType = "NGHI_DINH" | "THONG_TU" | "QUYET_DINH" | "LUAT" | "NGHI_QUYET" | "CONG_VAN";

export interface ParsedLegalMetadata {
  docType: VNDocType | null;
  docNumber: string | null;
  title: string | null;
  issuedDate: string | null; // YYYY-MM-DD
  effectiveDate: string | null; // YYYY-MM-DD
  summary: string | null;
  fullText: string;
  warnings: string[];
}

// =====================================================
// Document type detection
// =====================================================

const DOC_TYPE_PATTERNS: Array<{ type: VNDocType; patterns: RegExp[] }> = [
  {
    type: "NGHI_DINH",
    patterns: [
      /\bNGHỊ\s*ĐỊNH\b/i,
      /\bNghị\s*định\s*số/i,
      /\/NĐ-CP\b/, // số dạng XX/YYYY/NĐ-CP
    ],
  },
  {
    type: "THONG_TU",
    patterns: [
      /\bTHÔNG\s*TƯ\b/i,
      /\bThông\s*tư\s*số/i,
      /\/TT-[A-ZĐ]+\b/, // số dạng XX/YYYY/TT-BXD
    ],
  },
  {
    type: "QUYET_DINH",
    patterns: [
      /\bQUYẾT\s*ĐỊNH\b/i,
      /\bQuyết\s*định\s*số/i,
      /\/QĐ-/,
    ],
  },
  {
    type: "LUAT",
    patterns: [
      /\bLUẬT\s+[A-ZÀÁÂÃẠẢẤẦẨẬẮẰẲẴẶẸẺẼẾỀỂỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢÚÙỦŨỤỨỪỬỮỰÝỲỶỸỴĐ]/,
      /\bLuật\s+số\s+\d+\/\d+\/QH/i,
      /\/QH\d+\b/, // số dạng XX/YYYY/QH15
    ],
  },
  {
    type: "NGHI_QUYET",
    patterns: [
      /\bNGHỊ\s*QUYẾT\b/i,
      /\bNghị\s*quyết\s*số/i,
      /\/NQ-/,
    ],
  },
  {
    type: "CONG_VAN",
    patterns: [
      /\bCÔNG\s*VĂN\b/i,
      /\bCông\s*văn\s*số/i,
    ],
  },
];

export function detectDocType(text: string): VNDocType | null {
  // Lấy 2000 ký tự đầu (header + title vùng) để detect
  const head = text.slice(0, 2000);

  // Score-based: tìm pattern nào match nhiều nhất
  const scores: Record<string, number> = {};
  for (const { type, patterns } of DOC_TYPE_PATTERNS) {
    scores[type] = 0;
    for (const re of patterns) {
      const matches = head.match(new RegExp(re.source, re.flags + (re.flags.includes("g") ? "" : "g")));
      if (matches) scores[type] += matches.length;
    }
  }

  // Trả về type có score cao nhất
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (best && best[1] > 0) return best[0] as VNDocType;
  return null;
}

// =====================================================
// Document number extraction
// =====================================================

const DOC_NUMBER_PATTERNS: RegExp[] = [
  // Số: 78/2025/NĐ-CP, Số: 19/2025/TT-BNNMT
  /Số\s*:\s*([0-9]+\s*\/\s*[0-9]{4}\s*\/\s*[A-ZĐ][A-ZĐ\-/]*)/i,
  // Số: 234/QĐ-UBND
  /Số\s*:\s*([0-9]+\s*\/\s*[A-ZĐ][A-ZĐ\-]*)/i,
  // Bare 78/2025/NĐ-CP (không có "Số:")
  /\b([0-9]+\/[0-9]{4}\/[A-ZĐ][A-ZĐ\-]+)\b/,
];

export function extractDocNumber(text: string): string | null {
  const head = text.slice(0, 3000);
  for (const re of DOC_NUMBER_PATTERNS) {
    const m = head.match(re);
    if (m) {
      // Normalize: remove spaces around /
      return m[1].replace(/\s*\/\s*/g, "/").trim();
    }
  }
  return null;
}

// =====================================================
// Date extraction
// =====================================================

/** Parse date: "Hà Nội, ngày 01 tháng 4 năm 2025" → "2025-04-01" */
function parseVNDate(day: string, month: string, year: string): string | null {
  const d = parseInt(day);
  const m = parseInt(month);
  const y = parseInt(year);
  if (!d || !m || !y || d > 31 || m > 12 || y < 1900 || y > 2100) return null;
  return `${y}-${m.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
}

const ISSUED_DATE_PATTERNS: RegExp[] = [
  // "Hà Nội, ngày 01 tháng 4 năm 2025" / "Trần Phú, ngày 01 tháng 7 năm 2025"
  /[A-ZÀÁÂÃĐ][^,\n]{1,30},?\s*ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})/i,
  // "ngày 01 tháng 4 năm 2025"
  /ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})/i,
  // Format số: "01/04/2025"
  /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/,
];

export function extractIssuedDate(text: string): string | null {
  // Header thường ở 1500 ký tự đầu (sau tên cơ quan, trước nội dung)
  const head = text.slice(0, 2500);
  for (const re of ISSUED_DATE_PATTERNS) {
    const m = head.match(re);
    if (m) {
      const date = parseVNDate(m[1], m[2], m[3]);
      if (date) return date;
    }
  }
  return null;
}

const EFFECTIVE_DATE_PATTERNS: RegExp[] = [
  // "có hiệu lực thi hành kể từ ngày 15 tháng 02 năm 2025"
  /có\s+hiệu\s+lực[^.]*?ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})/i,
  // "Hiệu lực: 15/02/2025"
  /[Hh]iệu\s+lực[^:]*:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/,
];

export function extractEffectiveDate(text: string): string | null {
  // Hiệu lực thường ở phần Điều cuối → tìm trong toàn văn nhưng ưu tiên phần đuôi
  for (const re of EFFECTIVE_DATE_PATTERNS) {
    const m = text.match(re);
    if (m) {
      const date = parseVNDate(m[1], m[2], m[3]);
      if (date) return date;
    }
  }
  return null;
}

// =====================================================
// Title / Trích yếu extraction
// =====================================================

/**
 * Tiêu đề thường nằm sau loại văn bản (NGHỊ ĐỊNH/THÔNG TƯ...) trên 1-3 dòng,
 * trước phần "CHÍNH PHỦ" hoặc "THỦ TƯỚNG" hoặc "Căn cứ".
 */
export function extractTitle(text: string, docType: VNDocType | null): string | null {
  // Loại bỏ khoảng trắng thừa
  const normalized = text.replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n\n");
  const head = normalized.slice(0, 3000);

  // Tìm vị trí docType trong header
  const typeKeywords: Record<VNDocType, string[]> = {
    NGHI_DINH: ["NGHỊ ĐỊNH", "Nghị định"],
    THONG_TU: ["THÔNG TƯ", "Thông tư"],
    QUYET_DINH: ["QUYẾT ĐỊNH", "Quyết định"],
    LUAT: ["LUẬT", "Luật"],
    NGHI_QUYET: ["NGHỊ QUYẾT", "Nghị quyết"],
    CONG_VAN: ["CÔNG VĂN", "Công văn"],
  };

  if (!docType) {
    // Lấy paragraph đầu sau header
    const lines = head.split("\n").map((l) => l.trim()).filter((l) => l.length > 5);
    return lines.slice(0, 3).join(" ").slice(0, 400) || null;
  }

  const keywords = typeKeywords[docType];
  for (const kw of keywords) {
    const idx = head.indexOf(kw);
    if (idx === -1) continue;

    // Lấy text sau keyword 500 chars, tới khi gặp:
    // - "Căn cứ" (start of body)
    // - "CHÍNH PHỦ" / "THỦ TƯỚNG" / "BỘ TRƯỞNG" (signing authority block)
    // - 2 newlines liên tiếp (block separator)
    const after = head.slice(idx + kw.length);
    const stopMarkers = [
      /\bCăn\s+cứ\b/,
      /\bCHÍNH\s+PHỦ\b/,
      /\bTHỦ\s+TƯỚNG\b/,
      /\bBỘ\s+TRƯỞNG\b/,
      /\bUỶ\s+BAN/i,
      /\bỦY\s+BAN/i,
      /\bĐiều\s+1\b/i,
    ];

    let cutAt = after.length;
    for (const stop of stopMarkers) {
      const m = after.match(stop);
      if (m && m.index !== undefined && m.index < cutAt) cutAt = m.index;
    }

    let titleArea = after.slice(0, cutAt).trim();

    // Loại các dòng "Số:", "Hà Nội ngày...", "(Ban hành kèm)"
    titleArea = titleArea
      .split("\n")
      .map((l) => l.trim())
      .filter(
        (l) =>
          l.length > 3 &&
          !/^Số\s*:/i.test(l) &&
          !/^[A-Z][^,]+,\s*ngày\s+\d/i.test(l) &&
          !/^\(.*\)$/.test(l) &&
          !/^Độc\s+lập/i.test(l) &&
          !/^CỘNG\s+HÒA/i.test(l) &&
          !/^CỘNG\s+HOÀ/i.test(l) &&
          !/Hạnh\s+phúc/i.test(l) &&
          !/^Tự\s+do/i.test(l)
      )
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (titleArea.length >= 10) {
      return titleArea.slice(0, 500);
    }
  }

  return null;
}

// =====================================================
// Main parser
// =====================================================

export function parseVNLegalDocument(rawText: string): ParsedLegalMetadata {
  const warnings: string[] = [];
  const fullText = rawText.trim();

  if (fullText.length < 200) {
    warnings.push("Nội dung văn bản quá ngắn, có thể PDF không trích xuất được text (file scan ảnh).");
  }

  const docType = detectDocType(fullText);
  if (!docType) warnings.push("Không xác định được loại văn bản. Vui lòng chọn thủ công.");

  const docNumber = extractDocNumber(fullText);
  if (!docNumber) warnings.push("Không tìm thấy số văn bản. Vui lòng nhập thủ công.");

  const title = extractTitle(fullText, docType);
  if (!title) warnings.push("Không tự động trích được tên/trích yếu. Vui lòng nhập thủ công.");

  const issuedDate = extractIssuedDate(fullText);
  if (!issuedDate) warnings.push("Không tìm thấy ngày ban hành.");

  const effectiveDate = extractEffectiveDate(fullText) || issuedDate;
  if (!extractEffectiveDate(fullText) && issuedDate) {
    warnings.push("Không tìm thấy ngày hiệu lực rõ ràng → tạm dùng ngày ban hành.");
  }

  return {
    docType,
    docNumber,
    title,
    issuedDate,
    effectiveDate,
    summary: null,
    fullText,
    warnings,
  };
}
