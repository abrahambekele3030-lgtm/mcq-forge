import { PrismaClient } from '@prisma/client'

/**
 * Ensure DATABASE_URL is always set.
 *
 * Prisma's `env("DATABASE_URL")` in schema.prisma reads process.env at
 * client-instantiation time. If the variable is missing — which happens
 * during `next build` (static analysis), in production `next start` before
 * `.env` is loaded, or when someone forgets to create `.env` — Prisma throws
 * "Environment variable not found: DATABASE_URL" and crashes the whole app.
 *
 * The fix: set a sensible default BEFORE instantiating the client. The
 * default points to a local SQLite file so the app always boots; override
 * it by setting DATABASE_URL in `.env` or the host environment.
 */
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./db/custom.db'
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
