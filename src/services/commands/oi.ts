import { Command } from "./types.js";

const oi: Command = {
  command: "oi",
  execute: async (bot, message) => {
    await bot.sendMessage(message.key.remoteJid!, {
      text: "Olá! Eu sou o Eustáquio, bot de testes do Pedro",
    });
  },
};

export default oi;
