import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  sqlitePragmasPromise?: Promise<void>;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export function isSqliteDatabase(): boolean {
  const url = process.env.DATABASE_URL?.trim() || "";
  return url.startsWith("file:");
}

/**
 * Configures SQLite production pragmas once per process (skipped on PostgreSQL).
 * Tuned for single-node 1 GB RAM Oracle VPS: WAL concurrency + 8 MB page cache cap.
 */
export function ensureDbReady(): Promise<void> {
  if (globalForPrisma.sqlitePragmasPromise) {
    return globalForPrisma.sqlitePragmasPromise;
  }

  globalForPrisma.sqlitePragmasPromise = (async () => {
    if (!isSqliteDatabase()) return;
    try {
      await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL;");
      await prisma.$queryRawUnsafe("PRAGMA busy_timeout = 5000;");
      await prisma.$executeRawUnsafe("PRAGMA synchronous = NORMAL;");
      await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON;");
      await prisma.$executeRawUnsafe("PRAGMA cache_size = -8000;");
    } catch (err) {
      console.warn("[prisma] Could not apply SQLite pragmas:", err);
    }
  })();

  return globalForPrisma.sqlitePragmasPromise;
}

void ensureDbReady();

/**
 * Executes a Prisma interactive transaction with an immediate SQLite write lock.
 * In SQLite WAL mode, Prisma's default DEFERRED transaction allows concurrent reads
 * before first write (TOCTOU double-booking risk). Performing a fast no-op write on
 * BusinessSettings id=1 upgrades the transaction to RESERVED/IMMEDIATE atomically.
 */
export async function withImmediateLock<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  await ensureDbReady();
  return prisma.$transaction(
    async (tx) => {
      if (isSqliteDatabase()) {
        await tx.$executeRawUnsafe("UPDATE BusinessSettings SET id = id WHERE id = 1");
      }
      return fn(tx);
    },
    { maxWait: 5000, timeout: 10000 }
  );
}
