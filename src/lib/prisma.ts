/**
 * Mucha Kitchen — Prisma Client Singleton
 * ======================================
 *
 * Provides a single PrismaClient instance across the application.
 * In development, the same instance is reused via `globalThis` to prevent
 * connection pool exhaustion during hot reloads.
 *
 * Usage:
 *   import { prisma } from '@/lib/prisma';
 *   const reservations = await prisma.reservation.findMany({...});
 *
 * @see https://www.prisma.io/docs/orm/more/help-and-troubleshooting/help-articles/nextjs-prisma-client-dev-practices
 */
import { PrismaClient } from '@prisma/client';

/** Global cache for the PrismaClient singleton (dev-only). */
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/** The single PrismaClient instance used throughout the app. */
export const prisma = globalForPrisma.prisma || new PrismaClient();

// Persist the client on globalThis in development to survive hot reloads
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
