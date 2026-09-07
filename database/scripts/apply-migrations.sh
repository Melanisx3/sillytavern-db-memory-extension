#!/usr/bin/env sh
set -eu

MIGRATIONS_DIR="${MIGRATIONS_DIR:-./database/migrations}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:?POSTGRES_USER is required}"
POSTGRES_DB="${POSTGRES_DB:?POSTGRES_DB is required}"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "Migrations directory not found: $MIGRATIONS_DIR"
  exit 1
fi

for migration in "$MIGRATIONS_DIR"/*.sql; do
  [ -e "$migration" ] || continue
  echo "Applying migration: $(basename "$migration")"
  PGPASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}" \
    psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -v ON_ERROR_STOP=1 -f "$migration"
done

echo "Migrations applied successfully."
