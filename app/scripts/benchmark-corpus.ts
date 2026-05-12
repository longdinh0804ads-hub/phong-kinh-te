/**
 * Seed corpus benchmark RAG: 8 văn bản pháp lý mẫu phủ các lĩnh vực
 * Phòng Kinh Tế xã thường gặp:
 *   - Đất đai, môi trường, xây dựng, ATTP, nông nghiệp
 *   - Bảo vệ DLCN, CCHC, TTHC
 *
 * Mỗi văn bản có:
 *   - Số văn bản chuẩn VN
 *   - Cấu trúc Điều/Khoản/Điểm
 *   - Cross-reference (cite văn bản khác) để test multi-hop
 *   - Lĩnh vực rõ ràng (cho entity extraction test)
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
import { chunkLegalText } from "../lib/legal-parser";
import { embedBatch, vectorToSql, isEmbeddingAvailable, EMBEDDING_DIM } from "../lib/embeddings";

const db = new PrismaClient();

interface SeedDoc {
  title: string;
  docType: "NGHI_DINH" | "THONG_TU" | "QUYET_DINH" | "LUAT" | "NGHI_QUYET" | "CONG_VAN";
  docNumber: string;
  issuedDate: string;
  effectiveDate: string;
  summary: string;
  fullText: string;
}

const DOCS: SeedDoc[] = [
  // ============ 1. ĐẤT ĐAI ============
  {
    title: "Luật Đất đai (sửa đổi)",
    docType: "LUAT",
    docNumber: "31/2024/QH15",
    issuedDate: "2024-01-18",
    effectiveDate: "2025-01-01",
    summary: "Quy định mới về thu hồi đất, bồi thường, GPMB, cấp Giấy chứng nhận quyền sử dụng đất",
    fullText: `LUẬT ĐẤT ĐAI (sửa đổi)
Số: 31/2024/QH15

Điều 1. Phạm vi điều chỉnh
Luật này quy định về chế độ sở hữu đất đai, quyền hạn và trách nhiệm của Nhà nước đại diện chủ sở hữu toàn dân về đất đai và thống nhất quản lý về đất đai; chế độ quản lý và sử dụng đất đai; quyền và nghĩa vụ của công dân, người sử dụng đất đối với đất đai thuộc lãnh thổ của nước Cộng hòa xã hội chủ nghĩa Việt Nam.

Điều 79. Thu hồi đất để phát triển kinh tế - xã hội vì lợi ích quốc gia, công cộng
1. Nhà nước thu hồi đất trong trường hợp cần thiết để thực hiện các dự án phát triển kinh tế - xã hội vì lợi ích quốc gia, công cộng nhằm phát huy nguồn lực đất đai.
2. Việc thu hồi đất phải bảo đảm công khai, minh bạch, đúng quy định của pháp luật.
3. Tổ chức làm nhiệm vụ bồi thường, hỗ trợ, tái định cư có trách nhiệm xây dựng phương án bồi thường, hỗ trợ, tái định cư và trình cơ quan có thẩm quyền phê duyệt.

Điều 90. Bồi thường về đất khi Nhà nước thu hồi đất ở
1. Hộ gia đình, cá nhân đang sử dụng đất ở khi Nhà nước thu hồi đất nếu đủ điều kiện được bồi thường về đất theo quy định tại Điều 95 của Luật này thì được bồi thường bằng đất ở hoặc nhà ở hoặc bằng tiền theo nguyện vọng của người có đất thu hồi.
2. Việc bố trí tái định cư phải bảo đảm thuận lợi cho người được tái định cư, được thực hiện theo quy hoạch, kế hoạch sử dụng đất.

Điều 122. Cấp Giấy chứng nhận quyền sử dụng đất, quyền sở hữu tài sản gắn liền với đất
1. Việc cấp Giấy chứng nhận quyền sử dụng đất, quyền sở hữu tài sản gắn liền với đất đối với hộ gia đình, cá nhân đang sử dụng đất ổn định, có giấy tờ hợp lệ thực hiện theo quy định tại Điều này.
2. Hộ gia đình, cá nhân đang sử dụng đất không có giấy tờ về quyền sử dụng đất mà đất đó được sử dụng trước ngày 01 tháng 7 năm 2014 thì được cấp Giấy chứng nhận theo quy định.
3. UBND cấp xã có trách nhiệm xác nhận nguồn gốc, quá trình sử dụng đất và tình trạng tranh chấp.`,
  },

  // ============ 2. MÔI TRƯỜNG ============
  {
    title: "Nghị định quy định chi tiết một số điều của Luật Bảo vệ môi trường",
    docType: "NGHI_DINH",
    docNumber: "08/2022/NĐ-CP",
    issuedDate: "2022-01-10",
    effectiveDate: "2022-01-10",
    summary: "Hướng dẫn ĐTM, giấy phép môi trường, xử lý rác thải, quản lý chất thải nguy hại",
    fullText: `NGHỊ ĐỊNH
Quy định chi tiết một số điều của Luật Bảo vệ môi trường
Số: 08/2022/NĐ-CP

Điều 1. Phạm vi điều chỉnh
Nghị định này quy định chi tiết một số điều của Luật Bảo vệ môi trường về đánh giá tác động môi trường, giấy phép môi trường, đăng ký môi trường, quản lý chất thải rắn sinh hoạt, chất thải rắn công nghiệp thông thường, chất thải nguy hại.

Điều 26. Trách nhiệm quản lý chất thải rắn sinh hoạt tại địa phương
1. Ủy ban nhân dân cấp xã có trách nhiệm:
a) Tổ chức thu gom, vận chuyển chất thải rắn sinh hoạt từ hộ gia đình, cá nhân đến điểm tập kết hoặc trạm trung chuyển;
b) Tuyên truyền, vận động hộ gia đình, cá nhân phân loại chất thải rắn sinh hoạt tại nguồn;
c) Kiểm tra, giám sát việc tuân thủ quy định về quản lý chất thải rắn sinh hoạt trên địa bàn.
2. Phòng Tài nguyên và Môi trường (hoặc Phòng Kinh tế xã) có trách nhiệm tham mưu UBND cấp huyện trong việc quản lý chất thải rắn.

Điều 32. Hoạt động kiểm tra môi trường định kỳ
1. Cơ quan chuyên môn về bảo vệ môi trường thuộc UBND cấp xã/huyện tổ chức kiểm tra định kỳ ít nhất 1 lần/năm đối với các cơ sở sản xuất, kinh doanh trên địa bàn.
2. Nội dung kiểm tra bao gồm: tuân thủ giấy phép môi trường, quản lý chất thải, xả thải.
3. Cán bộ phụ trách lĩnh vực môi trường tại xã có trách nhiệm lập biên bản và đề xuất xử lý vi phạm.`,
  },

  // ============ 3. BẢO VỆ DLCN ============
  {
    title: "Nghị định bảo vệ dữ liệu cá nhân",
    docType: "NGHI_DINH",
    docNumber: "13/2023/NĐ-CP",
    issuedDate: "2023-04-17",
    effectiveDate: "2023-07-01",
    summary: "Quy định về xử lý, lưu trữ, bảo vệ dữ liệu cá nhân của công dân",
    fullText: `NGHỊ ĐỊNH
Bảo vệ dữ liệu cá nhân
Số: 13/2023/NĐ-CP

Điều 1. Phạm vi điều chỉnh
Nghị định này quy định về dữ liệu cá nhân, bảo vệ dữ liệu cá nhân, quyền và nghĩa vụ của các bên liên quan đến hoạt động xử lý dữ liệu cá nhân.

Điều 2. Đối tượng áp dụng
1. Cơ quan, tổ chức, cá nhân Việt Nam.
2. Cơ quan, tổ chức, cá nhân nước ngoài tại Việt Nam có liên quan trực tiếp hoặc gián tiếp đến hoạt động xử lý dữ liệu cá nhân tại Việt Nam.

Điều 11. Sự đồng ý của chủ thể dữ liệu
1. Sự đồng ý của chủ thể dữ liệu được áp dụng đối với tất cả hoạt động trong quy trình xử lý dữ liệu cá nhân.
2. Sự đồng ý của chủ thể dữ liệu chỉ có hiệu lực khi chủ thể dữ liệu tự nguyện và biết rõ về: loại dữ liệu cá nhân được xử lý; mục đích xử lý dữ liệu cá nhân; tổ chức, cá nhân được xử lý dữ liệu cá nhân; quyền, nghĩa vụ của chủ thể dữ liệu.

Điều 24. Đánh giá tác động xử lý dữ liệu cá nhân
1. Bên xử lý dữ liệu cá nhân phải lập hồ sơ đánh giá tác động xử lý dữ liệu cá nhân và gửi tới Bộ Công an trong thời hạn 60 ngày kể từ ngày tiến hành xử lý dữ liệu cá nhân.
2. Cơ quan hành chính nhà nước xử lý dữ liệu cá nhân của công dân phải tuân thủ điều khoản này, kể cả UBND cấp xã.

Điều 30. Xử lý vi phạm
1. Cơ quan, tổ chức vi phạm quy định bảo vệ dữ liệu cá nhân tùy theo mức độ có thể bị phạt tiền từ 50 triệu đến 5% doanh thu năm trước liền kề.
2. Cá nhân vi phạm bị xử phạt theo quy định pháp luật về xử lý vi phạm hành chính.`,
  },

  // ============ 4. THỦ TỤC HÀNH CHÍNH ============
  {
    title: "Nghị định về thực hiện thủ tục hành chính trên môi trường điện tử",
    docType: "NGHI_DINH",
    docNumber: "45/2020/NĐ-CP",
    issuedDate: "2020-04-08",
    effectiveDate: "2020-05-22",
    summary: "Quy định về dịch vụ công trực tuyến, một cửa, một cửa liên thông",
    fullText: `NGHỊ ĐỊNH
Về thực hiện thủ tục hành chính trên môi trường điện tử
Số: 45/2020/NĐ-CP

Điều 1. Phạm vi điều chỉnh
Nghị định này quy định về cung cấp dịch vụ công trực tuyến và sử dụng dịch vụ công trực tuyến trong giải quyết thủ tục hành chính.

Điều 9. Nguyên tắc giải quyết thủ tục hành chính
1. Lấy người dân, doanh nghiệp làm trung tâm.
2. Bảo đảm thuận tiện, công khai, minh bạch.
3. Một cửa, một cửa liên thông trong giải quyết thủ tục hành chính.
4. Áp dụng dịch vụ bưu chính công ích trong tiếp nhận, trả kết quả.

Điều 12. Thời hạn giải quyết hồ sơ
1. Thời hạn giải quyết hồ sơ thủ tục hành chính được tính theo ngày làm việc, kể từ ngày tiếp nhận hồ sơ đầy đủ.
2. Trường hợp hồ sơ chưa đầy đủ, cơ quan tiếp nhận phải thông báo bằng văn bản cho người nộp hồ sơ trong vòng 02 ngày làm việc.

Điều 18. Trách nhiệm UBND cấp xã
1. Tiếp nhận và giải quyết thủ tục hành chính thuộc thẩm quyền theo nguyên tắc một cửa.
2. Phòng chuyên môn (Tài chính-Kế hoạch, Kinh tế) hỗ trợ trực tiếp người dân khi đến nộp hồ sơ.
3. Đối với hồ sơ phức tạp về đất đai, môi trường, xây dựng - tham vấn ý kiến Phòng chuyên môn tương ứng.`,
  },

  // ============ 5. NÔNG NGHIỆP - AN TOÀN THỰC PHẨM ============
  {
    title: "Thông tư hướng dẫn quản lý an toàn thực phẩm thuộc lĩnh vực nông nghiệp",
    docType: "THONG_TU",
    docNumber: "38/2018/TT-BNNPTNT",
    issuedDate: "2018-12-25",
    effectiveDate: "2019-02-10",
    summary: "Kiểm tra ATTP cơ sở sản xuất thực phẩm nông sản, thủy sản",
    fullText: `THÔNG TƯ
Hướng dẫn quản lý an toàn thực phẩm
Số: 38/2018/TT-BNNPTNT

Điều 1. Phạm vi điều chỉnh
Thông tư này quy định việc thẩm định, chứng nhận và kiểm tra điều kiện đảm bảo an toàn thực phẩm đối với cơ sở sản xuất, kinh doanh thực phẩm thuộc phạm vi quản lý của Bộ Nông nghiệp và Phát triển nông thôn.

Điều 8. Trách nhiệm của Ủy ban nhân dân cấp xã
1. Quản lý cơ sở sản xuất nhỏ lẻ thực phẩm nông sản, thủy sản trên địa bàn.
2. Phối hợp với Phòng Kinh tế cấp huyện kiểm tra định kỳ ít nhất 2 lần/năm.
3. Tổ chức tuyên truyền pháp luật ATTP cho hộ sản xuất kinh doanh trên địa bàn.

Điều 12. Tổ kiểm tra liên ngành
1. UBND cấp xã thành lập Tổ kiểm tra liên ngành về an toàn thực phẩm với thành phần: cán bộ Phòng Kinh tế, cán bộ Y tế, công an, đại diện hội nông dân.
2. Tổ kiểm tra hoạt động theo kế hoạch hàng năm.
3. Khi phát hiện vi phạm, lập biên bản và xử lý theo thẩm quyền hoặc chuyển cơ quan cấp huyện xử lý nếu vượt thẩm quyền.

Điều 18. Báo cáo định kỳ
1. UBND cấp xã báo cáo tình hình ATTP về UBND cấp huyện 6 tháng/lần.
2. Phòng Kinh tế tham mưu báo cáo này, tổng hợp số liệu kiểm tra, vi phạm phát hiện.`,
  },

  // ============ 6. XÂY DỰNG ============
  {
    title: "Luật Xây dựng (sửa đổi)",
    docType: "LUAT",
    docNumber: "62/2020/QH14",
    issuedDate: "2020-06-17",
    effectiveDate: "2021-01-01",
    summary: "Quy định cấp giấy phép xây dựng, quản lý trật tự xây dựng, công trình nhà ở",
    fullText: `LUẬT XÂY DỰNG (sửa đổi)
Số: 62/2020/QH14

Điều 1. Phạm vi điều chỉnh
Luật này quy định về quyền, nghĩa vụ, trách nhiệm của cơ quan, tổ chức, cá nhân và quản lý nhà nước trong hoạt động đầu tư xây dựng.

Điều 89. Giấy phép xây dựng nhà ở riêng lẻ
1. Nhà ở riêng lẻ tại đô thị bắt buộc phải có giấy phép xây dựng trừ trường hợp được miễn theo quy định.
2. Hộ gia đình, cá nhân nộp hồ sơ tại UBND cấp xã hoặc cấp huyện tùy thẩm quyền.
3. Thời hạn cấp giấy phép không quá 15 ngày làm việc kể từ ngày nhận đủ hồ sơ hợp lệ.

Điều 102. Trách nhiệm quản lý trật tự xây dựng cấp xã
1. UBND cấp xã có trách nhiệm:
a) Kiểm tra, phát hiện vi phạm trật tự xây dựng trên địa bàn;
b) Lập biên bản, xử lý vi phạm theo thẩm quyền;
c) Đình chỉ thi công đối với công trình vi phạm.
2. Phòng Kinh tế xã (bộ phận Xây dựng - Công thương) là đầu mối tham mưu UBND xã trong công tác này.

Điều 118. Báo cáo trật tự xây dựng
1. UBND cấp xã báo cáo về UBND cấp huyện hàng quý về tình hình trật tự xây dựng.
2. Báo cáo phải nêu rõ số công trình kiểm tra, số vi phạm phát hiện, số xử lý.`,
  },

  // ============ 7. CCHC + CHUYỂN ĐỔI SỐ ============
  {
    title: "Quyết định phê duyệt Chương trình Chuyển đổi số quốc gia đến năm 2025",
    docType: "QUYET_DINH",
    docNumber: "749/QĐ-TTg",
    issuedDate: "2020-06-03",
    effectiveDate: "2020-06-03",
    summary: "Mục tiêu chuyển đổi số trong cơ quan nhà nước, kinh tế số, xã hội số",
    fullText: `QUYẾT ĐỊNH
Phê duyệt Chương trình Chuyển đổi số quốc gia đến năm 2025
Số: 749/QĐ-TTg

Điều 1. Phê duyệt Chương trình Chuyển đổi số quốc gia đến năm 2025, định hướng đến năm 2030 với nội dung chủ yếu sau:

I. QUAN ĐIỂM
1. Nhận thức đóng vai trò quyết định trong chuyển đổi số.
2. Người dân là trung tâm của chuyển đổi số.
3. Thể chế và công nghệ là động lực của chuyển đổi số.

II. TẦM NHÌN
Đến năm 2030, Việt Nam trở thành quốc gia số, ổn định và thịnh vượng, tiên phong thử nghiệm các công nghệ và mô hình mới.

III. MỤC TIÊU CHỦ YẾU ĐẾN 2025
1. Phát triển Chính phủ số:
a) 80% dịch vụ công trực tuyến mức độ 4 (cao nhất).
b) 100% hồ sơ thủ tục hành chính được xử lý trên môi trường mạng.
c) Cán bộ công chức được trang bị kỹ năng số.

2. Phát triển kinh tế số:
a) Kinh tế số chiếm 20% GDP.
b) Tỷ trọng kinh tế số trong từng ngành đạt tối thiểu 10%.

IV. NHIỆM VỤ, GIẢI PHÁP
1. UBND các cấp triển khai dịch vụ công trực tuyến.
2. Đào tạo cán bộ kỹ năng số.
3. Đầu tư hạ tầng số.`,
  },

  // ============ 8. CÔNG VĂN UBND XÃ TRẦN PHÚ ============
  {
    title: "Công văn về triển khai công tác bảo vệ môi trường năm 2026",
    docType: "CONG_VAN",
    docNumber: "245/UBND-KT",
    issuedDate: "2026-01-15",
    effectiveDate: "2026-01-15",
    summary: "UBND xã Trần Phú yêu cầu Phòng Kinh Tế triển khai kế hoạch BVMT năm 2026",
    fullText: `ỦY BAN NHÂN DÂN XÃ TRẦN PHÚ
Số: 245/UBND-KT

V/v triển khai công tác bảo vệ môi trường năm 2026

Kính gửi: Phòng Kinh Tế xã Trần Phú

Căn cứ Luật Bảo vệ môi trường 2020 và Nghị định 08/2022/NĐ-CP;
Căn cứ Quyết định 749/QĐ-TTg về chuyển đổi số gắn với quản lý môi trường;

Ủy ban nhân dân xã Trần Phú yêu cầu Phòng Kinh Tế:

1. Tổ chức kiểm tra môi trường định kỳ tại các cơ sở sản xuất nhỏ trên địa bàn, theo Điều 32 Nghị định 08/2022/NĐ-CP. Thời gian: Quý I/2026.

2. Phối hợp với Tổ liên ngành ATTP theo Thông tư 38/2018/TT-BNNPTNT kiểm tra ô nhiễm tại cơ sở chế biến nông sản. Thời gian: Tháng 2-3/2026.

3. Tổng hợp báo cáo gửi UBND xã trước ngày 15/4/2026, nội dung bao gồm:
- Số cơ sở đã kiểm tra
- Số vi phạm phát hiện, biện pháp xử lý
- Đề xuất kế hoạch quý tiếp theo

4. Phòng Kinh Tế cử cán bộ chuyên trách lĩnh vực Nông nghiệp - Môi trường làm đầu mối triển khai.

Nhận được công văn này, đề nghị Phòng Kinh Tế khẩn trương triển khai và báo cáo.

CHỦ TỊCH
(đã ký)`,
  },
];

async function main() {
  console.log(`\n📚 Seed ${DOCS.length} văn bản mẫu cho benchmark...\n`);

  // Cleanup các văn bản benchmark cũ (giữ NĐ 150/2025 đã có)
  await db.legalDocument.deleteMany({
    where: { docNumber: { in: DOCS.map((d) => d.docNumber) } },
  });

  if (!isEmbeddingAvailable()) {
    console.warn("⚠ Embedding chưa khả dụng (chưa có GEMINI_API_KEY) - chunks sẽ không có embedding");
  }

  for (const seed of DOCS) {
    const chunks = chunkLegalText(seed.fullText);
    console.log(`  Creating ${seed.docType} ${seed.docNumber} (${chunks.length} chunks)...`);

    const doc = await db.legalDocument.create({
      data: {
        title: seed.title,
        docType: seed.docType as any,
        docNumber: seed.docNumber,
        issuedDate: new Date(seed.issuedDate),
        effectiveDate: new Date(seed.effectiveDate),
        summary: seed.summary,
        status: "active",
        chunks: {
          create: chunks.map((c) => ({
            chunkIndex: c.chunkIndex,
            article: c.article,
            section: c.section,
            point: c.point,
            content: c.content,
          })),
        },
      },
      include: { chunks: { select: { id: true, content: true, chunkIndex: true } } },
    });

    if (isEmbeddingAvailable()) {
      const sortedChunks = [...doc.chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
      const texts = sortedChunks.map((c) => c.content);
      const vecs = await embedBatch(texts, "RETRIEVAL_DOCUMENT", 4);
      let embedded = 0;
      for (let i = 0; i < sortedChunks.length; i++) {
        const v = vecs[i];
        if (!v || v.length !== EMBEDDING_DIM) continue;
        await db.$executeRawUnsafe(
          `UPDATE legal_chunks SET embedding = $1::vector WHERE id = $2`,
          vectorToSql(v),
          sortedChunks[i].id
        );
        embedded++;
      }
      console.log(`    Embedded ${embedded}/${sortedChunks.length} chunks`);
    }
  }

  const total = await db.legalDocument.count();
  const totalChunks = await db.legalChunk.count();
  console.log(`\n✓ Done. Total docs: ${total}, total chunks: ${totalChunks}`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("✗ Fail:", e);
  await db.$disconnect();
  process.exit(1);
});
