import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const prismaClientSingleton = () => {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
};

const prisma = global.prisma ?? prismaClientSingleton();

// Em dev, reutiliza entre reloads; em produção não precisa guardar
if (process.env.NODE_ENV !== "production") global.prisma = prisma;

export default prisma;