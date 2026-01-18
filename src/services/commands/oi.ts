import { Command } from "./types.js";

const oi: Command = {
  command: "oi",
  execute: async (bot, message) => {
    await bot.sendMessage(message.key.remoteJid!, {
      text: "Olá! Aqui quem fala é o bot!",
    });
  },
};

export default oi;
