import { PrismaClient, Role, Department } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const DEFAULT_PASSWORD = "ChangeMe@2026";

interface SeedUser {
  email: string;
  name: string;
  role: Role;
  department: Department;
  position: string;
  fields: string[];
  areas: string[];
  teamGroupCode?: string;
  isTeamLeader?: boolean;
  responsibilities: string;
  phone?: string;
}

const USERS: SeedUser[] = [
  // === LÃNH ĐẠO ===
  {
    email: "tuan.vv@phongkinhte-tranphu.vn",
    name: "Vũ Văn Tuấn",
    role: "TRUONG_PHONG",
    department: "BAN_LANH_DAO",
    position: "Trưởng phòng",
    fields: ["Tài chính - Kế hoạch", "Nông nghiệp - Môi trường", "Xây dựng - Công thương"],
    areas: ["Toàn xã"],
    responsibilities:
      "Chịu trách nhiệm trước Đảng ủy, HĐND, UBND xã và pháp luật về toàn bộ hoạt động Phòng. " +
      "Trực tiếp duyệt, ký trình hồ sơ: Cấp GCNQSD đất ở lần đầu; chuyển MĐSDĐ; đính chính GCNQSD cấp lần đầu; " +
      "kiểm tra trích đo địa chính. Chủ tài khoản cơ quan, người phát ngôn của Phòng. " +
      "Chỉ đạo CCHC, chuyển đổi số, văn thư, lưu trữ. Xử lý phản ánh iHanoi.",
  },
  {
    email: "minh.tt@phongkinhte-tranphu.vn",
    name: "Trần Tuấn Minh",
    role: "PHO_TP",
    department: "BAN_LANH_DAO",
    position: "Phó Trưởng phòng",
    fields: ["Nông nghiệp - Môi trường", "Xây dựng - Công thương", "GPMB - Tái định cư"],
    areas: ["Toàn xã"],
    responsibilities:
      "Phụ trách Lĩnh vực Nông nghiệp & Môi trường: thu hồi đất, GPMB, tái định cư; thẩm định giao đất/cho thuê đất; " +
      "xác định giá đất; thống kê/kiểm kê đất đai; quy hoạch SDĐ; lâm nghiệp; đấu giá QSDĐ; " +
      "chăn nuôi/thú y; ATTP; môi trường; thủy lợi/đê điều/PCTT; nông thôn mới; giảm nghèo. " +
      "Lĩnh vực Xây dựng & Công thương: quy hoạch đô thị/nông thôn; TTXD; công nghiệp; thương mại; HTX; giao thông; nhà ở. " +
      "Duyệt ký TTHC XD-CT; cấp GCNQSDĐ nông nghiệp; gia hạn đất NN; xác nhận hồ sơ môi trường, ATTP.",
  },

  // === BỘ PHẬN TÀI CHÍNH - KẾ HOẠCH ===
  {
    email: "tu.vh@phongkinhte-tranphu.vn",
    name: "Vũ Huy Tư",
    role: "TRUONG_BO_PHAN",
    department: "TAI_CHINH_KE_HOACH",
    position: "Kế toán trưởng - Trưởng Bộ phận Tài chính KH",
    fields: ["Tài chính", "Kế hoạch", "Ngân sách", "Đầu tư"],
    areas: ["Toàn xã"],
    isTeamLeader: true,
    responsibilities:
      "Trưởng Bộ phận Tài chính - Kế hoạch. Chỉ đạo điều hành nhiệm vụ BP, " +
      "tổng hợp xây dựng dự toán, phân bổ và công khai dự toán, quyết toán thu chi NS hàng năm. " +
      "Cân đối ngân sách xã. Theo dõi nguồn vốn bổ sung có mục tiêu của NS Thành phố. " +
      "Theo dõi tài khoản tiền gửi của Phòng.",
  },
  {
    email: "hoan.nt@phongkinhte-tranphu.vn",
    name: "Nguyễn Thị Hoan",
    role: "CHUYEN_VIEN",
    department: "TAI_CHINH_KE_HOACH",
    position: "Chuyên viên",
    fields: ["Thu", "Giá", "Thuế", "Phí - Lệ phí", "Kế toán nội bộ"],
    areas: ["Phòng KT", "Phòng VH-XH", "Trạm Y tế", "Đảng/MTTQ", "Trung tâm DV tổng hợp"],
    responsibilities:
      "Tham mưu công tác quản lý nhà nước về thu, giá, thuế, phí và lệ phí. " +
      "Kế toán nội bộ phòng Kinh Tế. Phối hợp Phạm Tuấn Phan chi trả hỗ trợ Giảm nghèo. " +
      "Xây dựng lịch công tác hàng tuần, kế hoạch làm việc tháng. " +
      "Quản lý đơn vị dự toán: Phòng KT, Phòng VH-XH, Trạm Y tế, Đảng/MTTQ, Trung tâm DV.",
  },
  {
    email: "phuc.ltn@phongkinhte-tranphu.vn",
    name: "Lương Thị Ngọc Phúc",
    role: "CHUYEN_VIEN",
    department: "TAI_CHINH_KE_HOACH",
    position: "Chuyên viên",
    fields: ["Tài sản công", "DN nhỏ", "Kinh tế hợp tác", "Quỹ tín dụng"],
    areas: ["Ban QLDA đầu tư hạ tầng", "16 trường trên địa bàn"],
    responsibilities:
      "Tham mưu lĩnh vực Quản lý tài sản công, Hỗ trợ doanh nghiệp nhỏ, " +
      "kinh tế hợp tác, Quỹ tín dụng. Quản lý đơn vị: Ban QLDA đầu tư hạ tầng, 16 trường.",
  },
  {
    email: "dung.nt@phongkinhte-tranphu.vn",
    name: "Nguyễn Thị Dung",
    role: "NHAN_VIEN",
    department: "TAI_CHINH_KE_HOACH",
    position: "Nhân viên - Thủ quỹ",
    fields: ["Hỗ trợ thu", "Thủ quỹ"],
    areas: ["Phòng Kinh Tế"],
    responsibilities:
      "Hỗ trợ công tác thu, chuẩn bị các điều kiện tổ chức hoạt động chuyên môn. " +
      "Làm thủ quỹ nội bộ phòng Kinh Tế.",
  },

  // === BỘ PHẬN NÔNG NGHIỆP & MÔI TRƯỜNG; XÂY DỰNG & CÔNG THƯƠNG ===
  {
    email: "hoi.dx@phongkinhte-tranphu.vn",
    name: "Đinh Xuân Hội",
    role: "TRUONG_BO_PHAN",
    department: "NONG_NGHIEP_MOI_TRUONG",
    position: "Trưởng Bộ phận NN-MT, XD-CT",
    fields: ["Thủy lợi", "Đê điều", "PCTT", "Quản lý chung"],
    areas: ["Toàn xã"],
    isTeamLeader: true,
    responsibilities:
      "Trưởng Bộ phận NN-MT, XD-CT. Tham mưu lĩnh vực thủy lợi, đê điều, PCTT. " +
      "Huy động thành viên xử lý vi phạm tại các vị trí cụ thể. " +
      "Phụ trách điều hành các lĩnh vực thuộc trách nhiệm BP, báo cáo kết quả với lãnh đạo Phòng.",
  },
  {
    email: "thuan.td@phongkinhte-tranphu.vn",
    name: "Trịnh Duy Thuân",
    role: "CHUYEN_VIEN",
    department: "NONG_NGHIEP_MOI_TRUONG",
    position: "Chuyên viên",
    fields: ["Thu hồi đất", "GPMB", "Tái định cư", "Đất đai"],
    areas: ["Xã Mỹ Lương cũ"],
    responsibilities:
      "Đầu mối tham mưu thu hồi đất, GPMB, tái định cư các dự án. Thẩm định hồ sơ giao đất, cho thuê đất. " +
      "Tham gia các Hội đồng xác định giá đất. Tham mưu TTHC địa bàn xã Mỹ Lương cũ: " +
      "cấp GCNQSDĐ lần đầu, đất TMDV, cấp đổi/lại GCNQSDĐ NN sau DĐĐT, gia hạn đất NN, chuyển MĐSDĐ.",
  },
  {
    email: "tuoi.tt@phongkinhte-tranphu.vn",
    name: "Trương Thị Tươi",
    role: "CHUYEN_VIEN",
    department: "NONG_NGHIEP_MOI_TRUONG",
    position: "Chuyên viên tổng hợp",
    fields: ["Đất đai", "CCHC", "Chuyển đổi số", "Văn phòng văn thư", "Môi trường"],
    areas: ["Xã Hữu Văn cũ"],
    responsibilities:
      "Tham mưu TTHC đất đai địa bàn xã Hữu Văn cũ. Phụ trách CCHC và chuyển đổi số của Phòng. " +
      "Tham mưu xây dựng kế hoạch, chương trình về môi trường. Phụ trách công tác văn phòng, văn thư: " +
      "theo dõi nhắc việc tiến độ, lưu trữ công văn, quản lý con dấu, tổng hợp báo cáo định kỳ.",
  },
  {
    email: "chinh.vc@phongkinhte-tranphu.vn",
    name: "Vương Công Chính",
    role: "CHUYEN_VIEN",
    department: "NONG_NGHIEP_MOI_TRUONG",
    position: "Chuyên viên",
    fields: ["Thống kê đất đai", "Quy hoạch SDĐ", "Lâm nghiệp", "Phôi GCNQSDĐ"],
    areas: ["Xã Trần Phú cũ"],
    responsibilities:
      "Tham mưu công tác thống kê đất đai, kiểm kê đất đai, lập Quy hoạch/Kế hoạch SDĐ hàng năm, lâm nghiệp. " +
      "Quản lý phôi GCNQSDĐ. Tham mưu TTHC đất đai địa bàn xã Trần Phú cũ.",
  },
  {
    email: "hai.vt@phongkinhte-tranphu.vn",
    name: "Vũ Thị Hải",
    role: "CHUYEN_VIEN",
    department: "NONG_NGHIEP_MOI_TRUONG",
    position: "Chuyên viên",
    fields: ["Đất đai", "Đất tôn giáo", "Đấu giá QSDĐ"],
    areas: ["Xã Hoàng Văn Thụ cũ"],
    responsibilities:
      "Tham mưu TTHC đất đai địa bàn xã Hoàng Văn Thụ cũ. Cấp GCNQSDĐ tôn giáo, tín ngưỡng. " +
      "Theo dõi công tác tôn giáo, tín ngưỡng. Đấu giá QSDĐ nông nghiệp công ích.",
  },
  {
    email: "hung.nd@phongkinhte-tranphu.vn",
    name: "Nguyễn Danh Hùng",
    role: "CHUYEN_VIEN",
    department: "NONG_NGHIEP_MOI_TRUONG",
    position: "Chuyên viên - Tổ trưởng Tổ 1",
    fields: ["Kiểm tra đất đai", "Trật tự xây dựng", "Thủy lợi - đê điều"],
    areas: ["Hoàng Văn Thụ", "Hữu Văn", "1 phần Tân Tiến"],
    teamGroupCode: "to-1",
    isTeamLeader: true,
    responsibilities:
      "Tổ trưởng Tổ 1 kiểm tra đất đai, TTXD. Phụ trách 5 thôn xã HVT cũ: Văn Sơn, Văn Phú, Văn Mỹ, Thuần Lương, Yên Trình. " +
      "Đầu mối tổng hợp số liệu vi phạm hành chính đất đai, TTXD trên địa bàn HVT, Hữu Văn, 1 phần Tân Tiến cũ. " +
      "Phối hợp với Nguyễn Quốc Thủy, Đặng Quốc Chung.",
  },
  {
    email: "chung.dq@phongkinhte-tranphu.vn",
    name: "Đặng Quốc Chung",
    role: "CHUYEN_VIEN",
    department: "NONG_NGHIEP_MOI_TRUONG",
    position: "Chuyên viên",
    fields: ["Kiểm tra đất đai", "TTXD", "Hòa giải"],
    areas: ["Xã HVT cũ - 4 thôn Công An, Hòa Bình, Tiến Văn, An Tiến"],
    teamGroupCode: "to-1",
    responsibilities:
      "Phối hợp Tổ 1 kiểm tra địa bàn HVT, Hữu Văn, 1 phần Tân Tiến. " +
      "Phụ trách 4 thôn xã HVT cũ: Công An, Hòa Bình, Tiến Văn, An Tiến. " +
      "Thành viên các Hội đồng hòa giải.",
  },
  {
    email: "thuy.nq@phongkinhte-tranphu.vn",
    name: "Nguyễn Quốc Thủy",
    role: "CHUYEN_VIEN",
    department: "NONG_NGHIEP_MOI_TRUONG",
    position: "Chuyên viên",
    fields: ["Kiểm tra đất đai", "TTXD", "Môi trường"],
    areas: ["Xã Hữu Văn cũ"],
    teamGroupCode: "to-1",
    responsibilities:
      "Phối hợp Tổ 1, phụ trách địa bàn xã Hữu Văn cũ. " +
      "Tham mưu kiểm tra tổ chức/cá nhân/cơ sở SXKD, cơ sở giết mổ gia súc gia cầm về BVMT. " +
      "Hướng dẫn chủ đầu tư hạ tầng cụm CN thực hiện trách nhiệm BVMT.",
  },
  {
    email: "hop.hv@phongkinhte-tranphu.vn",
    name: "Hoàng Văn Hợp",
    role: "CHUYEN_VIEN",
    department: "XAY_DUNG_CONG_THUONG",
    position: "Chuyên viên - Tổ trưởng Tổ 2",
    fields: ["Kiểm tra đất đai", "TTXD", "Cấp phép xây dựng", "TTHC XD"],
    areas: ["Mỹ Lương", "Trần Phú", "1 phần Đồng Tâm"],
    teamGroupCode: "to-2",
    isTeamLeader: true,
    responsibilities:
      "Tổ trưởng Tổ 2 kiểm tra đất đai, TTXD. Đầu mối tổng hợp số liệu vi phạm địa bàn ML, TP, 1 phần ĐT cũ. " +
      "Thực hiện TTHC đầu tư xây dựng. Tham mưu cấp phép xây dựng theo thẩm quyền. " +
      "Thẩm định cấp/gia hạn/điều chỉnh/thu hồi GPXD. Phối hợp Bùi Bá Chung, Cao Văn Thịnh.",
  },
  {
    email: "chung.bb@phongkinhte-tranphu.vn",
    name: "Bùi Bá Chung",
    role: "CHUYEN_VIEN",
    department: "XAY_DUNG_CONG_THUONG",
    position: "Chuyên viên",
    fields: ["Vi phạm đất đai", "TTXD", "Thủy lợi", "GPMB"],
    areas: ["Xã Mỹ Lương cũ"],
    teamGroupCode: "to-2",
    responsibilities:
      "Xử lý vi phạm đất đai, TTXD, công trình thủy lợi địa bàn xã Mỹ Lương cũ. " +
      "Tham gia PCTT. Phối hợp Cao Văn Thịnh, Hoàng Văn Hợp. " +
      "Tham mưu thu hồi đất, GPMB, tái định cư dự án theo phân công.",
  },
  {
    email: "thinh.cv@phongkinhte-tranphu.vn",
    name: "Cao Văn Thịnh",
    role: "CHUYEN_VIEN",
    department: "XAY_DUNG_CONG_THUONG",
    position: "Chuyên viên",
    fields: ["Vi phạm đất đai", "TTXD", "Thủy lợi - đê điều", "Nông thôn mới", "GPMB"],
    areas: ["Xã Trần Phú cũ"],
    teamGroupCode: "to-2",
    responsibilities:
      "Xử lý vi phạm đất đai, TTXD, công trình thủy lợi, đê điều địa bàn xã Trần Phú cũ. " +
      "Tham mưu công tác Nông thôn mới trên địa bàn xã. Phối hợp Bùi Bá Chung, Hoàng Văn Hợp. " +
      "Tham mưu thu hồi đất, GPMB, tái định cư.",
  },
  {
    email: "phan.pt@phongkinhte-tranphu.vn",
    name: "Phạm Tuấn Phan",
    role: "CHUYEN_VIEN",
    department: "NONG_NGHIEP_MOI_TRUONG",
    position: "Chuyên viên",
    fields: ["Chăn nuôi - thú y", "Thủy sản", "ATTP nông sản", "Giảm nghèo"],
    areas: ["Toàn xã"],
    responsibilities:
      "Phụ trách lĩnh vực chăn nuôi và thú y, thủy sản; quản lý nhà nước về khuyến nông, khuyến ngư; " +
      "chất lượng, chế biến, ATTP nông sản/lâm sản/thủy sản. " +
      "Tham mưu tổ chức triển khai phụ trách công tác Giảm nghèo (đầu mối).",
  },
  {
    email: "diep.tt@phongkinhte-tranphu.vn",
    name: "Trần Thị Diệp",
    role: "CHUYEN_VIEN",
    department: "NONG_NGHIEP_MOI_TRUONG",
    position: "Chuyên viên",
    fields: ["HTX nông nghiệp", "Trồng trọt", "BVTV", "OCOP", "Du lịch nông thôn"],
    areas: ["Toàn xã"],
    responsibilities:
      "Phụ trách kinh tế HTX nông, lâm, ngư nghiệp gắn với ngành nghề nông thôn. " +
      "Quản lý trồng trọt, BVTV, đào tạo làng nghề nông thôn. Quản lý chất lượng vật tư nông nghiệp. " +
      "Chuyển đổi cơ cấu cây trồng vật nuôi. Tham mưu phát triển KT nông thôn gắn OCOP và du lịch nông thôn.",
  },
  {
    email: "hoanh.tq@phongkinhte-tranphu.vn",
    name: "Tạ Quang Hoành",
    role: "CHUYEN_VIEN",
    department: "NONG_NGHIEP_MOI_TRUONG",
    position: "Chuyên viên",
    fields: ["Nhà ở - công sở", "PCCC", "Môi trường", "TN nước", "Đa dạng SH", "BĐKH"],
    areas: ["Toàn xã"],
    responsibilities:
      "Tổ chức thực hiện cơ chế, chính sách về nhà ở và công sở; quản lý quỹ nhà ở. " +
      "Điều tra/thống kê BĐS. Phòng cháy chữa cháy. " +
      "Quản lý nhà nước về môi trường, tài nguyên nước, đa dạng sinh học, BĐKH. " +
      "Quản lý mô hình BVMT làng nghề; vận hành thu gom/xử lý CTR sinh hoạt khu nông thôn. " +
      "Tiếp nhận đăng ký, giấy phép môi trường dự án/cơ sở SXKD.",
  },
  {
    email: "tien.dd@phongkinhte-tranphu.vn",
    name: "Đặng Đức Tiễn",
    role: "CHUYEN_VIEN",
    department: "XAY_DUNG_CONG_THUONG",
    position: "Chuyên viên",
    fields: ["Công thương", "Thương mại", "ATTP công thương", "Quản lý chợ", "EVN"],
    areas: ["Toàn xã"],
    responsibilities:
      "Quản lý nhà nước lĩnh vực công thương. Kiểm tra chống buôn lậu, gian lận thương mại, hàng giả. " +
      "ATTP lĩnh vực công thương. Tham mưu văn bản chỉ đạo điều hành quản lý thương mại; đầu tư khai thác chợ. " +
      "Tham mưu TTHC công thương (CN, tiểu thủ CN, khuyến công). " +
      "Quản lý nhà nước về EVN và đơn vị kinh doanh điện ngoài EVN.",
  },
];

async function main() {
  console.log("🌱 Bắt đầu seed dữ liệu...");

  // 1. Tạo TaskGroups (Tổ 1, Tổ 2)
  console.log("📦 Tạo Task Groups...");
  await db.taskGroup.upsert({
    where: { code: "to-1" },
    update: {},
    create: {
      code: "to-1",
      name: "Tổ 1 - Kiểm tra đất đai, TTXD",
      description:
        "Kiểm tra quản lý đất đai, trật tự xây dựng địa bàn xã Hoàng Văn Thụ, Hữu Văn và 1 phần xã Tân Tiến cũ",
      area: "Hoàng Văn Thụ + Hữu Văn + 1 phần Tân Tiến cũ",
    },
  });
  await db.taskGroup.upsert({
    where: { code: "to-2" },
    update: {},
    create: {
      code: "to-2",
      name: "Tổ 2 - Kiểm tra đất đai, TTXD",
      description:
        "Kiểm tra quản lý đất đai, trật tự xây dựng địa bàn xã Mỹ Lương, Trần Phú và 1 phần xã Đồng Tâm cũ",
      area: "Mỹ Lương + Trần Phú + 1 phần Đồng Tâm cũ",
    },
  });

  // 2. Tạo 21 users
  console.log("👥 Tạo 21 users...");
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);

  for (const userData of USERS) {
    const user = await db.user.upsert({
      where: { email: userData.email },
      update: {
        name: userData.name,
        role: userData.role,
        department: userData.department,
        position: userData.position,
        fields: userData.fields,
        areas: userData.areas,
        teamGroupCode: userData.teamGroupCode,
        isTeamLeader: userData.isTeamLeader ?? false,
        responsibilities: userData.responsibilities,
      },
      create: {
        email: userData.email,
        emailVerified: true,
        name: userData.name,
        passwordHash,
        role: userData.role,
        department: userData.department,
        position: userData.position,
        fields: userData.fields,
        areas: userData.areas,
        teamGroupCode: userData.teamGroupCode,
        isTeamLeader: userData.isTeamLeader ?? false,
        responsibilities: userData.responsibilities,
        isActive: true,
      },
    });

    // Better Auth Account record
    await db.account.upsert({
      where: {
        providerId_accountId: {
          providerId: "credential",
          accountId: user.id,
        },
      },
      update: { password: passwordHash },
      create: {
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password: passwordHash,
      },
    });

    console.log(`  ✓ ${userData.role.padEnd(15)} ${userData.name}`);
  }

  console.log("\n✅ Seed hoàn tất!");
  console.log(`   Tổng: ${USERS.length} users + 2 task groups`);
  console.log(`   Mật khẩu mặc định: ${DEFAULT_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error("❌ Seed lỗi:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
