#!/usr/bin/env bash
# mcq-forge — create/migrate the PostgreSQL schema.
# Idempotent: safe to run on every boot.
#
# Usage:
#   bun run db:setup          # local dev (reads .env)
#   NODE_ENV=production bun run db:setup   # production (reads host env)
#
# This wraps `prisma db push` and waits for the database to be reachable,
# which matters on Render where the web service may boot before Postgres
# is fully ready.
set -e

echo "[db:setup] ensuring PostgreSQL schema exists..."

if [ -z "$DATABASE_URL" ]; then
  echo "[db:setup] ERROR: DATABASE_URL is not set."
  echo "  Set it in .env (local) or the host environment (Render)."
  echo "  Example: postgresql://user:pass@host:5432/dbname?sslmode=require"
  exit 1
fi

# Wait for the database to be reachable (up to 30s).
# On Render, the web service can boot before Postgres accepts connections.
echo "[db:setup] waiting for database to accept connections..."
for i in $(seq 1 30); do
  if bunx prisma db execute --schema prisma/schema.prisma --stdin <<< "SELECT 1;" >/dev/null 2>&1; then
    echo "[db:setup] database is reachable."
    break
  fi
  echo "[db:setup] attempt $i/30: database not ready yet, retrying in 1s..."
  sleep 1
  if [ "$i" -eq 30 ]; then
    echo "[db:setup] WARNING: could not confirm database reachability after 30s."
    echo "[db:setup] Continuing anyway — prisma db push will retry."
  fi
done

# Push the schema (creates tables if missing, alters if changed).
# --accept-data-loss: only applied if a column type change would lose data;
#   for fresh databases this is a no-op.
echo "[db:setup] running prisma db push..."
bunx prisma db push --accept-data-loss --skip-generate

echo "[db:setup] done. Schema is in sync."
