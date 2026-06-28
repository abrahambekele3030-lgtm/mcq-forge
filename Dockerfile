# mcq-forge — Docker image for Render (and any container host)
# Based on the official Bun image. Installs poppler-utils for pdftotext.
#
# DATABASE_URL is NOT set here — it must be provided by the host environment
# (Render dashboard env var, or .env file for local dev). The schema uses
# PostgreSQL, so DATABASE_URL must be a postgresql:// connection string.

FROM oven/bun:1.1-debian

# System deps: poppler-utils provides pdftotext + pdfinfo (CONSTRAINT 0).
RUN apt-get update && apt-get install -y --no-install-recommends \
      poppler-utils \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps (respecting lockfile if present)
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile 2>/dev/null || bun install

# Copy source
COPY . .

# Generate Prisma client (postinstall also does this, but be explicit)
RUN bunx prisma generate

# Build the Next.js app (output: "standalone" produces .next/standalone/)
RUN bun run build

# Runtime dirs for uploaded PDFs and generated outputs (ephemeral on free tier).
RUN mkdir -p /data/uploads /data/outputs

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Render sets DATABASE_URL from the linked Postgres database.
# The start command waits for the DB to be reachable, runs prisma db push to
# create/migrate the schema (idempotent), then launches Next.js.
# This ensures tables exist on first deploy and after any schema change.
CMD ["sh", "-c", "bash scripts/db-setup.sh && exec bun run start"]
