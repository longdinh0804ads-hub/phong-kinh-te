# Cron Setup Guide

Hệ thống cảnh báo nhiệm vụ dùng **4 cron job** chạy ở các thời điểm khác nhau trong ngày.

## Tổng quan

| Endpoint | Schedule (UTC) | Schedule (VN giờ) | Mô tả |
|---|---|---|---|
| `/api/cron/risk-scan` | `0 17 * * *` | **00:00 sáng** | Quét rủi ro tổng quát: overdue, deadline D-3/D-1/D-0 (đã gồm), stale, awaiting review |
| `/api/cron/morning-digest` | `0 1 * * *` | **08:00 sáng** | Bản tin sáng cho TP: tổng hợp overdue + đến hạn + sắp hạn 3 ngày |
| `/api/cron/dayend-digest` | `0 9 * * *` | **16:00 chiều** | Báo cáo cuối ngày cho TP: hoàn thành / mới / báo cáo / idle |
| `/api/cron/performance-analysis` | `0 10 * * *` | **17:00 chiều** | Phân tích hiệu quả cán bộ → tạo đề xuất nhắc nhở cho TP duyệt |

**Lý do chọn 17:00 cho performance:** chạy sau dayend digest (16:00) để bao gồm data trong ngày.

---

## Setup trên cron-job.org (free tier)

### Bước 1: Lấy CRON_SECRET

Trong Vercel project settings → Environment Variables → `CRON_SECRET`. Copy giá trị.

### Bước 2: Tạo 4 cron job

Vào https://cron-job.org → đăng nhập → "Create cronjob".

**Cron 1 - Risk Scan**
- Title: `PKT - Risk Scan`
- URL: `https://phong-kinh-te.vercel.app/api/cron/risk-scan`
- Schedule: Custom → `0 17 * * *` (UTC)
- Request Method: `POST`
- Headers: `Authorization: Bearer <CRON_SECRET>`
- Save

**Cron 2 - Morning Digest**
- Title: `PKT - Morning Digest 8h VN`
- URL: `https://phong-kinh-te.vercel.app/api/cron/morning-digest`
- Schedule: `0 1 * * *` (UTC)
- Method: `POST`
- Headers: `Authorization: Bearer <CRON_SECRET>`

**Cron 3 - Day-End Digest**
- Title: `PKT - Day-End Digest 16h VN`
- URL: `https://phong-kinh-te.vercel.app/api/cron/dayend-digest`
- Schedule: `0 9 * * *` (UTC)
- Method: `POST`
- Headers: `Authorization: Bearer <CRON_SECRET>`

**Cron 4 - Performance Analysis**
- Title: `PKT - Performance Analysis 17h VN`
- URL: `https://phong-kinh-te.vercel.app/api/cron/performance-analysis`
- Schedule: `0 10 * * *` (UTC)
- Method: `POST`
- Headers: `Authorization: Bearer <CRON_SECRET>`

### Bước 3: Test

Trigger thủ công từng cron để verify (cron-job.org có nút "Execute Now").

Expected response (JSON):
```json
{
  "ok": true,
  "recipientCount": 2,
  "notificationsCreated": 2,
  ...
}
```

Nếu trả `{"error": "Unauthorized"}` → check lại Header `Authorization: Bearer <secret>`.

---

## Local test

```bash
curl -X POST http://localhost:4000/api/cron/morning-digest \
  -H "Authorization: Bearer <CRON_SECRET>"

curl -X POST http://localhost:4000/api/cron/dayend-digest \
  -H "Authorization: Bearer <CRON_SECRET>"

curl -X POST http://localhost:4000/api/cron/performance-analysis \
  -H "Authorization: Bearer <CRON_SECRET>"
```

---

## Khi lên VPS (sau này)

Thay cron-job.org bằng systemd timer. File mẫu `deploy/systemd/pkt-cron-*.timer`:

```ini
[Unit]
Description=PKT Morning Digest

[Timer]
OnCalendar=*-*-* 01:00:00 UTC
Persistent=true

[Install]
WantedBy=timers.target
```

Service tương ứng (`pkt-cron-morning.service`):

```ini
[Unit]
Description=PKT Morning Digest run

[Service]
Type=oneshot
EnvironmentFile=/etc/loha/cron.env
ExecStart=/usr/bin/curl -X POST \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  http://localhost:3000/api/cron/morning-digest
```

Enable: `sudo systemctl enable --now pkt-cron-morning.timer`

---

## Monitoring

Mỗi cron endpoint trả JSON đếm số notification + errors. Lưu lại log trên cron-job.org dashboard để theo dõi.

Log lỗi xem qua:
- Vercel dashboard → Functions → `/api/cron/*` → Runtime logs
- `/admin/audit` (Super Admin)
