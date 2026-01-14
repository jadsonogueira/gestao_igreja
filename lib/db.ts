import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });
}

// Singleton pattern - sempre reutilizar conexão
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// Garantir que em TODOS os ambientes mantemos o singleton
globalForPrisma.prisma = prisma;

export default prisma;
