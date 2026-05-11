#!/bin/bash
# =============================================================================
# Backup encrypted DB cho PKT Trần Phú
# =============================================================================
# Tạo dump PostgreSQL → encrypt bằng GPG → rsync sang backup server.
# Cron: chạy daily 02:00 (cron entry mẫu cuối file).
#
# Yêu cầu trên VPS:
#   - postgresql-client (pg_dump)
#   - gnupg (gpg)
#   - rsync
#   - GPG public key cho backup@loha.local đã import:
#       sudo -u loha gpg --import /etc/loha/keys/backup-pub.asc
#
# Yêu cầu trên backup server (Windows local hoặc Linux):
#   - rsync server / SSH listener
#
# Restore:
#   gpg --decrypt backup-2026-05-11.sql.gpg | psql -U pkt phong_kinh_te
# =============================================================================

set -euo pipefail

# ---------- CONFIG (chỉnh theo môi trường) ----------
DB_NAME="${DB_NAME:-phong_kinh_te}"
DB_USER="${DB_USER:-pkt}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"

BACKUP_DIR="/srv/backup/loha"
GPG_RECIPIENT="${GPG_RECIPIENT:-backup@loha.local}"
RETENTION_DAYS=30

# Remote backup target (SSH/rsync). Để trống nếu chỉ local.
REMOTE_USER="${REMOTE_BACKUP_USER:-}"
REMOTE_HOST="${REMOTE_BACKUP_HOST:-}"
REMOTE_PATH="${REMOTE_BACKUP_PATH:-/srv/backup/loha-mirror}"
REMOTE_PORT="${REMOTE_BACKUP_PORT:-22}"

# ----------------------------------------------------

TIMESTAMP=$(date +%Y-%m-%d_%H%M%S)
DUMP_FILE="$BACKUP_DIR/pkt-$TIMESTAMP.sql"
ENC_FILE="$DUMP_FILE.gpg"
LOG_FILE="$BACKUP_DIR/backup.log"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

log "════ Backup started ════"

# 1. pg_dump
log "1/5 pg_dump $DB_NAME..."
PGPASSWORD="${PGPASSWORD:-}" pg_dump \
    -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
    --no-owner --no-acl --clean --if-exists \
    -d "$DB_NAME" > "$DUMP_FILE"

DUMP_SIZE=$(stat -c%s "$DUMP_FILE")
log "  Dump OK - $DUMP_SIZE bytes"

# 2. Encrypt với GPG (recipient pub key, không cần passphrase khi backup)
log "2/5 GPG encrypt với recipient $GPG_RECIPIENT..."
gpg --batch --yes --encrypt \
    --recipient "$GPG_RECIPIENT" \
    --compress-algo zlib --compress-level 6 \
    --output "$ENC_FILE" \
    "$DUMP_FILE"

ENC_SIZE=$(stat -c%s "$ENC_FILE")
log "  Encrypt OK - $ENC_SIZE bytes"

# 3. Verify - decrypt thử xem có readable không
# (Cần private key trên cùng máy mới verify đầy đủ - skip nếu không có)
log "3/5 Verify encryption header..."
if gpg --list-only --no-default-keyring --quiet "$ENC_FILE" >/dev/null 2>&1; then
    log "  Header OK"
else
    log "  WARN: không verify được header GPG"
fi

# 4. Xóa file plaintext
log "4/5 Xóa file plaintext..."
shred -u "$DUMP_FILE"

# 5. Rsync sang backup server (nếu cấu hình)
if [[ -n "$REMOTE_USER" && -n "$REMOTE_HOST" ]]; then
    log "5/5 Rsync → $REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH ..."
    rsync -avz --partial \
        -e "ssh -p $REMOTE_PORT -o StrictHostKeyChecking=accept-new" \
        "$ENC_FILE" \
        "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/"
    log "  Rsync OK"
else
    log "5/5 Remote backup chưa cấu hình - skip rsync"
fi

# 6. Cleanup file cũ > RETENTION_DAYS
log "Cleanup file cũ > $RETENTION_DAYS ngày..."
find "$BACKUP_DIR" -name "pkt-*.sql.gpg" -mtime +$RETENTION_DAYS -delete

COUNT=$(find "$BACKUP_DIR" -name "pkt-*.sql.gpg" | wc -l)
log "  Còn lại $COUNT file backup"

log "════ Backup completed ════"

# =============================================================================
# CRON ENTRY MẪU - /etc/cron.d/loha-backup
# =============================================================================
# 0 2 * * * loha /opt/loha/deploy/backup/backup-encrypted.sh >> /var/log/loha-backup.log 2>&1
# =============================================================================
