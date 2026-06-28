import { PrismaClient } from '@prisma/client'

/**
 * Ensure DATABASE_URL is always set before instantiating PrismaClient.
 *
 * Prisma's `env("DATABASE_URL")` in schema.prisma reads process.env at
 * client-instantiation time. If the variable is missing, Prisma throws
 * "Environment variable not found: DATABASE_URL" and crashes the app.
 *
 * The schema uses PostgreSQL, so DATABASE_URL MUST be a `postgresql://` URL.
 * If it's missing we log a clear error instead of silently falling back to
 * SQLite (which would crash with provider="postgresql").
 *
 * Set DATABASE_URL in .env or the host environment:
 *   postgresql://user:pass@host:5432/dbname?sslmode=require
 */
if (!process.env.DATABASE_URL) {
  console.error(
    '[mcq-forge] FATAL: DATABASE_URL is not set.\n' +
    '  The schema uses PostgreSQL. Set DATABASE_URL to your Postgres connection string,\n' +
    '  e.g. postgresql://user:pass@host:5432/dbname?sslmode=require\n' +
    '  Create a .env file (see .env.example) or set it in the host environment.'
  )
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error', 'warn'] : ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
