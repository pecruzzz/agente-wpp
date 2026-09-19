import type { WASocket } from "baileys";
import { logger } from "../services/logger/logger.js";
import { normalizeCommandToken, type ParsedMessage } from "./parser.js";
import { canExecute, type AccessPolicy } from "./permissions.js";
import { createContext, type Command } from "./context.js";

export type Router = Map<string, Command>;

export function buildRouter(commands: Command[]): Router {
  const router: Router = new Map();

  for (const command of commands) {
    const keys = [command.name, ...(command.aliases ?? [])];
    for (const key of keys) {
      const normalized = normalizeCommandToken(key);
      if (normalized !== key) {
        throw new Error(
          `Comando "${key}" não está normalizado; use "${normalized}" (minúsculo, sem acento).`,
        );
      }
      if (router.has(key)) {
        throw new Error(`Comando duplicado: "${key}" já está registrado.`);
      }
      router.set(key, command);
    }
  }

  return router;
}

export async function dispatch(
  router: Router,
  bot: WASocket,
  parsed: ParsedMessage,
  policy: AccessPolicy,
): Promise<void> {
  if (!parsed.command) return;

  const command = router.get(parsed.command);
  if (!command) return;

  if (!canExecute(parsed, policy)) {
    logger.warn({ sender: parsed.senderJid, chat: parsed.chatJid }, "Comando bloqueado");
    return;
  }

  const ctx = createContext(bot, parsed);

  try {
    await command.handler(ctx);
  } catch (error) {
    logger.error({ err: error, command: command.name }, "Falha ao executar comando");
    try {
      await ctx.reply("Deu erro ao executar esse comando. Tenta de novo daqui a pouco.");
    } catch (replyError) {
      logger.error({ err: replyError }, "Falha ao avisar o usuário sobre o erro");
    }
  }
}
