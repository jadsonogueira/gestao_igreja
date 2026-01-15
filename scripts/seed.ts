import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const grupos = [
    {
      nomeGrupo: "aniversario",
      mensagemPadrao: "Feliz aniversário! Que Deus abençoe sua vida.",
      frequenciaEnvio: "diario",
    },
    {
      nomeGrupo: "pastoral",
      mensagemPadrao: "Mensagem pastoral semanal",
      frequenciaEnvio: "semanal",
    },
    {
      nomeGrupo: "devocional",
      mensagemPadrao: "Devocional diário",
      frequenciaEnvio: "diario",
    },
    {
      nomeGrupo: "visitantes",
      mensagemPadrao: "Seja bem-vindo à nossa igreja!",
      frequenciaEnvio: "mensal",
    },
    {
      nomeGrupo: "membros_sumidos",
      mensagemPadrao: "Sentimos sua falta. Estamos orando por você.",
      frequenciaEnvio: "mensal",
    },
  ];

  for (const grupo of grupos) {
    await prisma.messageGroup.upsert({
      where: { nomeGrupo: grupo.nomeGrupo },
      update: {},
      create: grupo,
    });
  }

  console.log("✅ Grupos criados com sucesso");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());