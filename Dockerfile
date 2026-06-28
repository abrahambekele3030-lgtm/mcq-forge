# mcq-forge — Docker image for Render (and any container host)
# Based on the official Bun image. Installs poppler-utils for pdftotext.

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

# Runtime data dir — mount a Render disk here for persistence (optional).
RUN mkdir -p /data/uploads /data/outputs /data/db

# Default to a persistent SQLite path so uploads/survives across restarts
# when a disk is mounted at /data. Override DATABASE_URL to use Postgres instead.
ENV DATABASE_URL="file:/data/db/custom.db"
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# `next start` reads the PORT env var automatically.
CMD ["bun", "run", "start"]
