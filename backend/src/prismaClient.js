const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

// ponytail: Prisma 7 dropped the bare `new PrismaClient()` env-based connection;
// it now requires an explicit driver adapter. Upgrade path if Prisma changes this again:
// check prisma.config.ts / @prisma/adapter-pg docs.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

const prisma = global.__prisma || new PrismaClient({ adapter });
if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

module.exports = prisma;
