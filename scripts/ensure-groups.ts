import prisma from "../lib/db";

async function main() {
  const groups = [
    {
      nomeGrupo: "aniversario",
      mensagemPadrao: "🎉 Feliz Aniversário! 🎉",
      frequenciaEnvio: "aniversario", // ou "Aniversario" dependendo do seu padrão
      horaEnvio: 9,
      minutoEnvio: 0,
      diaSemana: null,
      diaMes: null,
      flyerUrl: null,
      ativo: true,
      ultimoEnvio: null,
      proximoEnvio: null,
    },
    {
      nomeGrupo: "pastoral",
      mensagemPadrao: "",
      frequenciaEnvio: "mensal",
      horaEnvio: 9,
      minutoEnvio: 0,
      diaSemana: null,
      diaMes: 1,
      flyerUrl: null,
      ativo: false,
    },
    {
      nomeGrupo: "devocional",
      mensagemPadrao: "",
      frequenciaEnvio: "diaria",
      horaEnvio: 7,
      minutoEnvio: 0,
      diaSemana: null,
      diaMes: null,
      flyerUrl: null,
      ativo: true,
    },
    {
      nomeGrupo: "visitantes",
      mensagemPadrao: "",
      frequenciaEnvio: "semanal",
      horaEnvio: 9,
      minutoEnvio: 0,
      diaSemana: 0,
      diaMes: null,
      flyerUrl: null,
      ativo: true,
    },
    {
      nomeGrupo: "membros_sumidos",
      mensagemPadrao: "",
      frequenciaEnvio: "semanal",
      horaEnvio: 9,
      minutoEnvio: 0,
      diaSemana: 0,
      diaMes: null,
      flyerUrl: null,
      ativo: true,
    },
  ] as const;

  for (const g of groups) {
    await prisma.messageGroup.upsert({
      where: { nomeGrupo: g.nomeGrupo },
      update: { ...g },
      create: { ...g },
    });
    console.log("OK:", g.nomeGrupo);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
