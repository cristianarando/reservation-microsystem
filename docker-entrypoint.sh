#!/bin/sh
set -e

PRISMA_BIN="/opt/prisma/node_modules/.bin/prisma"
if [ ! -x "$PRISMA_BIN" ]; then
  PRISMA_BIN="prisma"
fi

# Extract SQLite DB path when using file:/... DATABASE_URL
DB_FILE=""
case "${DATABASE_URL:-}" in
  file:*)
    DB_FILE="${DATABASE_URL#file:}"
    DB_FILE="${DB_FILE%%\?*}"
    ;;
esac

# Preventive SQLite backup (keeps up to 3 rotating snapshots before applying migrations)
if [ -n "$DB_FILE" ] && [ -s "$DB_FILE" ]; then
  BACKUP_DIR="$(dirname "$DB_FILE")/backups"
  mkdir -p "$BACKUP_DIR"
  STAMP="$(date +%Y%m%d-%H%M%S)"
  cp "$DB_FILE" "$BACKUP_DIR/pre-migrate-$STAMP.db"
  # Keep newest 3 backups only
  ls -1t "$BACKUP_DIR"/pre-migrate-*.db 2>/dev/null | tail -n +4 | xargs -r rm -f || true
  echo "[entrypoint] Preventive DB backup stored in $BACKUP_DIR/pre-migrate-$STAMP.db"
fi

echo "[entrypoint] Applying Prisma migrations..."
MIGRATE_OUT=""
if ! MIGRATE_OUT="$("$PRISMA_BIN" migrate deploy 2>&1)"; then
  echo "$MIGRATE_OUT"
  if echo "$MIGRATE_OUT" | grep -q "P3005"; then
    echo "[entrypoint] Existing unbaselined SQLite schema detected (P3005); baselining 20261125000000_init..."
    "$PRISMA_BIN" migrate resolve --applied "20261125000000_init"
    "$PRISMA_BIN" migrate deploy
  else
    exit 1
  fi
else
  echo "$MIGRATE_OUT"
fi

echo "[entrypoint] Starting Next.js standalone server..."
exec node server.js
