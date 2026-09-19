import type { WASocket } from "baileys";
import type { ParsedMessage } from "./parser.js";

export type CommandContext = ParsedMessage & {
  bot: WASocket;
  /** Responde no chat de origem. Evita repetir sendMessage(remoteJid!, …). */
  reply: (text: string) => Promise<void>;
};

export type Command = {
  /** Deve estar normalizado: minúsculo e sem acentos. Ver normalizeCommandToken. */
  name: string;
  aliases?: string[];
  description: string;
  handler: (ctx: CommandContext) => Promise<void>;
};

export function createContext(bot: WASocket, parsed: ParsedMessage): CommandContext {
  return {
    ...parsed,
    bot,
    reply: async (text: string) => {
      await bot.sendMessage(parsed.chatJid, { text });
    },
  };
}
