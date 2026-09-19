import type { Command } from "../core/context.js";

const oi: Command = {
  name: "oi",
  description: "Responde a um cumprimento",
  handler: async (ctx) => {
    await ctx.reply("Olá! Eu sou o Eustáquio, bot de testes do Pedro");
  },
};

export default oi;
