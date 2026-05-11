#!/usr/bin/env bash
# Deploy script cho Phòng Kinh Tế App
set -euo pipefail

echo "🚀 Deploy Phòng Kinh Tế App"

if [ ! -f .env ]; then
  echo "❌ File .env không tồn tại. Copy từ .env.example:"
  echo "  cp .env.example .env && nano .env"
  exit 1
fi

echo "📥 Pull code mới nhất..."
git pull origin main

echo "🐳 Build & start containers..."
docker compose build app
docker compose up -d

echo "⏳ Đợi DB sẵn sàng..."
sleep 5

echo "🗄️  Push schema..."
docker compose exec -T app npx prisma db push --accept-data-loss

echo "🌱 Kiểm tra seed (chỉ chạy nếu DB rỗng)..."
USER_COUNT=$(docker compose exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT COUNT(*) FROM users;" 2>/dev/null || echo "0")
if [ "$USER_COUNT" = "0" ]; then
  echo "  → DB rỗng, chạy seed..."
  docker compose exec -T app npx tsx prisma/seed.ts
else
  echo "  → Đã có $USER_COUNT users, bỏ qua seed."
fi

echo "🔄 Restart app..."
docker compose restart app

echo "✅ Deploy hoàn tất!"
echo ""
echo "Endpoints:"
echo "  - App: $APP_URL"
echo "  - Login: $APP_URL/login"
echo "  - Mật khẩu mặc định seed: ChangeMe@2026"

docker compose ps
