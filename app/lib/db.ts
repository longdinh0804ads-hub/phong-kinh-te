import { PrismaClient } from "@prisma/client";
import { fieldCipherExtension } from "./crypto/field-cipher";

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

function createPrismaClient() {
  // KHÔNG log "warn" trong dev vì Prisma log query params có thể chứa PII.
  // Chỉ "error" để debug khi cần.
  const client = new PrismaClient({
    log: ["error"],
  });
  return client.$extends(fieldCipherExtension);
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
