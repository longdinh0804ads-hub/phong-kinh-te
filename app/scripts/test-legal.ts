// Test: tạo legal documents mẫu để verify RAG pipeline
import { PrismaClient } from "@prisma/client";
import { chunkLegalText } from "../lib/legal-parser";

const db = new PrismaClient();

const SAMPLE_LAW = `
Điều 1. Phạm vi điều chỉnh
Nghị định này quy định chi tiết một số điều và biện pháp tổ chức thực hiện Luật Đất đai năm 2024, bao gồm cấp giấy chứng nhận quyền sử dụng đất, quyền sở hữu nhà ở và tài sản khác gắn liền với đất, đăng ký đất đai, quy hoạch và kế hoạch sử dụng đất.

Điều 2. Đối tượng áp dụng
1. Cơ quan quản lý nhà nước về đất đai các cấp.
2. Người sử dụng đất, người được cấp giấy chứng nhận quyền sử dụng đất.
3. Tổ chức, cá nhân khác có liên quan đến hoạt động quản lý và sử dụng đất.

Điều 3. Cấp giấy chứng nhận quyền sử dụng đất ở lần đầu
1. Hồ sơ cấp giấy chứng nhận quyền sử dụng đất ở lần đầu bao gồm:
a) Đơn đề nghị cấp giấy chứng nhận theo mẫu;
b) Một trong các loại giấy tờ về quyền sử dụng đất quy định tại Điều 100 Luật Đất đai;
c) Giấy tờ tùy thân của người đề nghị (CCCD/CMND);
d) Giấy tờ chứng minh quyền sử dụng đất hợp pháp.
2. Trình tự thủ tục cấp giấy chứng nhận quyền sử dụng đất ở lần đầu:
a) Nộp hồ sơ tại Bộ phận một cửa của Ủy ban nhân dân cấp xã hoặc Văn phòng đăng ký đất đai;
b) Văn phòng đăng ký đất đai kiểm tra hồ sơ, thẩm định trong vòng 30 ngày;
c) Cơ quan có thẩm quyền cấp giấy chứng nhận trong vòng 7 ngày sau thẩm định.
3. Phí cấp giấy chứng nhận theo quy định của Hội đồng nhân dân cấp tỉnh.

Điều 4. Chuyển mục đích sử dụng đất
1. Người sử dụng đất có nhu cầu chuyển mục đích sử dụng đất phải nộp hồ sơ tại Văn phòng đăng ký đất đai.
2. Hồ sơ chuyển mục đích sử dụng đất gồm:
a) Đơn đăng ký chuyển mục đích sử dụng đất;
b) Giấy chứng nhận quyền sử dụng đất đã được cấp;
c) Bản đồ địa chính khu đất;
d) Văn bản chấp thuận của cơ quan có thẩm quyền (nếu có).
3. Thời hạn giải quyết: không quá 15 ngày làm việc kể từ ngày nhận đủ hồ sơ hợp lệ.

Điều 5. Đính chính sai sót giấy chứng nhận quyền sử dụng đất
1. Trường hợp giấy chứng nhận đã cấp có sai sót về thông tin người sử dụng đất, vị trí, diện tích, mục đích sử dụng, người sử dụng đất có quyền yêu cầu đính chính.
2. Hồ sơ đính chính bao gồm:
a) Đơn đề nghị đính chính;
b) Giấy chứng nhận quyền sử dụng đất đã cấp (bản chính);
c) Tài liệu chứng minh sai sót.
3. Cơ quan cấp giấy chứng nhận phải thực hiện đính chính trong 10 ngày làm việc.
`.trim();

async function main() {
  console.log("📚 Tạo văn bản pháp luật mẫu...");

  const chunks = chunkLegalText(SAMPLE_LAW);
  console.log(`  Đã chunk thành ${chunks.length} đoạn:`);
  for (const c of chunks) {
    console.log(`    - ${c.article || "?"}${c.section ? ` ${c.section}` : ""}: ${c.content.slice(0, 50)}...`);
  }

  const truong = await db.user.findUnique({ where: { email: "tuan.vv@phongkinhte-tranphu.vn" } });
  if (!truong) throw new Error("No truong phong");

  // Xóa nếu có
  await db.legalDocument.deleteMany({
    where: { docType: "NGHI_DINH", docNumber: "TEST-DAT-2024" },
  });

  const doc = await db.legalDocument.create({
    data: {
      title: "Nghị định mẫu về cấp GCNQSD đất - Test seed",
      docType: "NGHI_DINH",
      docNumber: "TEST-DAT-2024",
      issuedDate: new Date("2024-01-01"),
      effectiveDate: new Date("2024-02-15"),
      status: "active",
      uploadedById: truong.id,
      summary: "Văn bản test cho RAG pipeline",
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
  });

  console.log(`✅ Đã tạo document ${doc.id} với ${chunks.length} chunks.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
