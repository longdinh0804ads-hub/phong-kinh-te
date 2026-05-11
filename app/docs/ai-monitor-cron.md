# AI Risk Monitor — Cron setup

## Tổng quan
Background scanner phát hiện rủi ro công việc và tạo thông báo (Bell popup) cho assignee + lãnh đạo. Chạy mỗi 30 phút.

## Endpoint
- **URL:** `POST /api/cron/risk-scan` (hoặc `GET` đều OK)
- **Auth:** `Authorization: Bearer <CRON_SECRET>` HOẶC `?secret=<CRON_SECRET>`
- **Response:** JSON summary (risks detected, notifications created/skipped, durationMs)
- **CRON_SECRET:** đặt trong `.env.local` (đã sinh sẵn 1 secret 64-hex)

## Loại rủi ro được quét
| Type | Trigger | Recipient |
|---|---|---|
| `RISK_OVERDUE` | Task quá hạn chưa hoàn thành | assignee + lãnh đạo |
| `RISK_DEADLINE_SOON` | Task < 24h tới hạn | assignee + lãnh đạo |
| `RISK_STALE_PENDING` | Task PENDING > 7 ngày | assignee + lãnh đạo |
| `RISK_UBND_DEADLINE` | UBND directive < 48h tới hạn | assignee + TP/PTP |
| `RISK_OVERLOAD` | Cán bộ > 10 task active | lãnh đạo |
| `RISK_NO_REPORT` | Task IN_PROGRESS > 14 ngày chưa báo cáo | assignee + lãnh đạo |

## De-dup
Cùng `(userId, type, link)` không tạo lại trong 24h. Lần scan sau chỉ thông báo cho rủi ro **mới** hoặc rủi ro đã từng cảnh báo nhưng đã qua 24h.

## Cài đặt cron (3 phương án)

### A. cron-job.org (đơn giản nhất, free)
1. Đăng ký https://cron-job.org
2. Tạo job mới:
   - URL: `https://<DOMAIN>/api/cron/risk-scan?secret=<CRON_SECRET>`
   - Schedule: every 30 minutes
   - Method: GET
3. Done.

### B. GitHub Actions (nếu repo public/private trên GitHub)
File `.github/workflows/risk-scan.yml`:
```yaml
name: Risk Scan
on:
  schedule:
    - cron: '*/30 * * * *'
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -fsS -X POST \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            https://<DOMAIN>/api/cron/risk-scan
```
GitHub Secret: `CRON_SECRET` = giá trị trong `.env.local`.

### C. OS cron (self-hosted VPS)
```cron
*/30 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<DOMAIN>/api/cron/risk-scan > /var/log/risk-scan.log 2>&1
```

## Test thủ công
```bash
# Test với seed data
npx tsx scripts/test-risk-scanner.ts

# Hit endpoint
curl -s "http://localhost:3000/api/cron/risk-scan?secret=$CRON_SECRET" | jq
```

## Monitoring
- Mỗi lần scan log 1 record `AIAuditLog` với `action=monitor:risk-scan`, output là JSON summary, duration ms.
- Query để xem 10 scan gần nhất:
  ```sql
  SELECT "createdAt", "success", "duration", "output"->>'notificationsCreated' as created
  FROM ai_audit_logs
  WHERE action = 'monitor:risk-scan'
  ORDER BY "createdAt" DESC LIMIT 10;
  ```

## Tuning thresholds
Sửa `THRESHOLDS` trong [lib/ai-monitor/scanner.ts](../lib/ai-monitor/scanner.ts):
- `DEADLINE_SOON_HOURS`: 24 (giờ trước hạn coi là sắp tới)
- `UBND_DEADLINE_HOURS`: 48
- `STALE_PENDING_DAYS`: 7
- `NO_REPORT_DAYS`: 14
- `OVERLOAD_TASKS`: 10
- `DEDUP_WINDOW_HOURS`: 24
