import { PrismaClient } from "@prisma/client";

// Single shared instance — Prisma manages its own connection pool
// internally, so this should not be re-instantiated per-request.
export const prisma = new PrismaClient();
