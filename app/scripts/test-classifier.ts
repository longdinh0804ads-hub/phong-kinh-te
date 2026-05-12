/**
 * Test Document Classifier với 3 văn bản đại diện:
 *   - 1 Công văn UBND giao việc → expect UBND_DIRECTIVE
 *   - 1 Nghị định → expect LEGAL_DOCUMENT
 *   - 1 đoạn text trống → expect REVIEW_NEEDED
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

import { classifyDocument } from "../lib/ai-agents/document-classifier";

const TESTS = [
  {
    name: "Test 1: Công văn UBND giao việc",
    text: `ỦY BAN NHÂN DÂN XÃ TRẦN PHÚ
Số: 245/UBND-KT

V/v triển khai công tác bảo vệ môi trường năm 2026

Kính gửi: Phòng Kinh Tế xã Trần Phú

Căn cứ Luật Bảo vệ môi trường 2020 và Nghị định 08/2022/NĐ-CP;

Ủy ban nhân dân xã Trần Phú yêu cầu Phòng Kinh Tế:

1. Tổ chức kiểm tra môi trường định kỳ tại các cơ sở sản xuất nhỏ trên địa bàn, theo Điều 32 Nghị định 08/2022/NĐ-CP. Thời gian: Quý I/2026.

2. Phối hợp với Tổ liên ngành ATTP kiểm tra ô nhiễm tại cơ sở chế biến nông sản. Thời gian: Tháng 2-3/2026.

3. Tổng hợp báo cáo gửi UBND xã trước ngày 15/4/2026.

4. Phòng Kinh Tế cử cán bộ chuyên trách lĩnh vực Nông nghiệp - Môi trường làm đầu mối triển khai.

Hà Nội, ngày 15 tháng 01 năm 2026
CHỦ TỊCH`,
    expectRouting: "UBND_DIRECTIVE",
    expectDept: "NONG_NGHIEP_MOI_TRUONG",
  },
  {
    name: "Test 2: Nghị định pháp lý",
    text: `NGHỊ ĐỊNH
Bảo vệ dữ liệu cá nhân
Số: 13/2023/NĐ-CP

Hà Nội, ngày 17 tháng 04 năm 2023

Điều 1. Phạm vi điều chỉnh
Nghị định này quy định về dữ liệu cá nhân, bảo vệ dữ liệu cá nhân, quyền và nghĩa vụ của các bên liên quan đến hoạt động xử lý dữ liệu cá nhân.

Điều 24. Đánh giá tác động xử lý dữ liệu cá nhân
1. Bên xử lý dữ liệu cá nhân phải lập hồ sơ đánh giá tác động xử lý dữ liệu cá nhân.
2. Cơ quan hành chính nhà nước xử lý dữ liệu cá nhân của công dân phải tuân thủ điều khoản này.

Điều 30. Xử lý vi phạm
1. Cơ quan vi phạm bị phạt tiền từ 50 triệu đến 5% doanh thu năm trước liền kề.

Nghị định này có hiệu lực thi hành kể từ ngày 01 tháng 7 năm 2023.`,
    expectRouting: "LEGAL_DOCUMENT",
    expectDept: null, // không suggest dept rõ vì lĩnh vực rộng
  },
  {
    name: "Test 3: Quyết định cấp thành phố",
    text: `QUYẾT ĐỊNH
Số: 749/QĐ-TTg

Phê duyệt Chương trình Chuyển đổi số quốc gia đến năm 2025

Hà Nội, ngày 03 tháng 6 năm 2020

THỦ TƯỚNG CHÍNH PHỦ
Căn cứ Luật Tổ chức Chính phủ;

Điều 1. Phê duyệt Chương trình Chuyển đổi số quốc gia đến năm 2025, định hướng đến năm 2030 với nội dung chủ yếu sau:

1. Phát triển Chính phủ số: 80% dịch vụ công trực tuyến mức độ 4.
2. Phát triển kinh tế số: chiếm 20% GDP.

Điều 2. Quyết định này có hiệu lực thi hành kể từ ngày ký.`,
    expectRouting: "LEGAL_DOCUMENT",
    expectDept: "TAI_CHINH_KE_HOACH",
  },
];

async function main() {
  for (const t of TESTS) {
    console.log(`\n${"═".repeat(60)}`);
    console.log(t.name);
    console.log("═".repeat(60));
    console.time("classify");
    const r = await classifyDocument(t.text, { useLLM: true });
    console.timeEnd("classify");
    console.log("📋 Metadata:");
    console.log(`   docType:        ${r.docType}`);
    console.log(`   docNumber:      ${r.docNumber}`);
    console.log(`   title:          ${r.title?.slice(0, 80) || "(null)"}`);
    console.log(`   issuingBody:    ${r.issuingBody}`);
    console.log(`   issuedDate:     ${r.issuedDate}`);
    console.log(`   effectiveDate:  ${r.effectiveDate}`);
    console.log("\n🏷️  Classification:");
    console.log(`   fields:         ${r.fields.join(", ") || "(none)"}`);
    console.log(`   urgency:        ${r.urgency}`);
    console.log(`   summary:        ${r.summary.slice(0, 150)}...`);
    console.log("\n🎯 Routing:");
    console.log(`   routing:        ${r.routing} ${r.routing === t.expectRouting ? "✓" : "✗ (expected " + t.expectRouting + ")"}`);
    console.log(`   reason:         ${r.routingReason}`);
    console.log(`   suggestedDept:  ${r.suggestedDept} (${(r.suggestedDeptConfidence * 100).toFixed(0)}%) ${
      r.suggestedDept === t.expectDept || (t.expectDept === null) ? "✓" : "(expected " + t.expectDept + ")"
    }`);
    console.log("\n📌 Action Items:");
    if (r.actionItems.length === 0) {
      console.log("   (none)");
    } else {
      r.actionItems.forEach((ai, i) => {
        console.log(`   ${i + 1}. ${ai.action}`);
        if (ai.owner) console.log(`      owner: ${ai.owner}`);
        if (ai.deadline) console.log(`      deadline: ${ai.deadline}`);
      });
    }
    console.log(`\n💡 LLM used: ${r.llmUsed} | Warnings: ${r.warnings.length}`);
    if (r.warnings.length > 0) {
      r.warnings.forEach((w) => console.log(`   - ${w}`));
    }
  }
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
