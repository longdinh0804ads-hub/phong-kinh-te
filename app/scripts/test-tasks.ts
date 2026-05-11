// Test script: tạo task mẫu để verify Phase 02
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  console.log("📋 Đang tạo task mẫu để test...");

  const truong = await db.user.findUnique({ where: { email: "tuan.vv@phongkinhte-tranphu.vn" } });
  const pho = await db.user.findUnique({ where: { email: "minh.tt@phongkinhte-tranphu.vn" } });
  const hung = await db.user.findUnique({ where: { email: "hung.nd@phongkinhte-tranphu.vn" } });
  const to1 = await db.taskGroup.findUnique({ where: { code: "to-1" } });
  const to2 = await db.taskGroup.findUnique({ where: { code: "to-2" } });

  if (!truong || !pho || !hung || !to1 || !to2) {
    console.error("Missing seed data");
    process.exit(1);
  }

  // Task 1: Trưởng phòng giao cho Phó TP
  const t1 = await db.task.create({
    data: {
      title: "Tổng hợp báo cáo thu chi quý 1/2026",
      description: "Tổng hợp toàn bộ số liệu thu chi ngân sách quý 1, lập báo cáo trình UBND xã trước ngày 15/4/2026.",
      priority: "CAO",
      deadline: new Date("2026-06-15"),
      creatorId: truong.id,
      assigneeId: pho.id,
      sourceType: "INTERNAL",
    },
  });

  // Task 2: Giao cho Tổ 1
  const t2 = await db.task.create({
    data: {
      title: "Kiểm tra trật tự xây dựng xã Hoàng Văn Thụ",
      description: "Tổ 1 tiến hành kiểm tra toàn bộ địa bàn xã Hoàng Văn Thụ về vi phạm TTXD trong tháng 5/2026.",
      priority: "CAO",
      deadline: new Date("2026-05-31"),
      creatorId: truong.id,
      taskGroupId: to1.id,
      sourceType: "INTERNAL",
    },
  });

  // Task 3: Khẩn cấp giao cá nhân
  const t3 = await db.task.create({
    data: {
      title: "Xử lý phản ánh iHanoi #PA-2026-001234",
      description: "Phản ánh người dân về việc đổ rác trái phép tại khu vực ven đường ĐT 419. Cần xác minh và xử lý trong 3 ngày.",
      priority: "KHAN_CAP",
      deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      creatorId: truong.id,
      assigneeId: hung.id,
      sourceType: "IHANOI",
    },
  });

  // Task 4: Quá hạn
  const t4 = await db.task.create({
    data: {
      title: "Báo cáo tình hình NTM tuần 18",
      description: "Báo cáo tuần về tình hình triển khai chương trình Nông thôn mới.",
      priority: "THUONG",
      deadline: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      creatorId: pho.id,
      assigneeId: hung.id,
      sourceType: "INTERNAL",
      status: "OVERDUE",
    },
  });

  // Task 5: Có progress report
  const t5 = await db.task.create({
    data: {
      title: "Lập kế hoạch SDĐ năm 2027",
      description: "Lập quy hoạch và kế hoạch sử dụng đất năm 2027 toàn xã.",
      priority: "THUONG",
      deadline: new Date("2026-08-30"),
      creatorId: truong.id,
      assigneeId: hung.id,
      status: "IN_PROGRESS",
      startedAt: new Date(),
      sourceType: "INTERNAL",
    },
  });

  await db.progressReport.create({
    data: {
      taskId: t5.id,
      reporterId: hung.id,
      percentComplete: 30,
      notes: "Đã thu thập số liệu hiện trạng SDĐ năm 2025. Đang chờ số liệu dân số cập nhật.",
      year: 2026,
      monthNumber: 5,
      weekNumber: 19,
    },
  });

  console.log("✅ Đã tạo 5 task mẫu:");
  console.log(`  1. ${t1.title} (giao cho Phó TP)`);
  console.log(`  2. ${t2.title} (giao Tổ 1)`);
  console.log(`  3. ${t3.title} (khẩn cấp)`);
  console.log(`  4. ${t4.title} (quá hạn)`);
  console.log(`  5. ${t5.title} (có progress 30%)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
