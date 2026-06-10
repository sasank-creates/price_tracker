/**
 * Shared Prisma client singleton.
 *
 * IMPORTANT: Do NOT create `new PrismaClient()` anywhere else in the codebase.
 * Multiple instances cause MongoDB Atlas connection pool exhaustion on cloud
 * deployments (Render, Railway, Fly.io, etc.) which silently causes DB queries
 * to fail intermittently — exactly the "sometimes works, sometimes doesn't" symptom.
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

module.exports = prisma;
