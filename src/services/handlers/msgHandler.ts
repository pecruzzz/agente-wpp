import type { WASocket } from "baileys";
import type { FormattedMessage } from "./msgParser.js";
import { commands } from "../commands/index.js";
import { ALLOWED_GROUPS, MY_JIDS } from "../../configs.js";
import { logger } from "../logger/logger.js";
import { canExecute } from "../../permissions.js";

const MessageHandler = async (bot: WASocket, message: FormattedMessage) => {
  const jid = message.key.remoteJid;
  if (!jid) return;

  if (!canExecute(message)) {
    logger.warn(`Bloqueado: ${jid}`);
    return;
  }

  const text = message.content
    ?.toLowerCase()
    .replace(/[^\p{L}\p{N}\s!\-|]/gu, "")

    .trim();

  if (!text) return;

  for (const command of commands) {
    if (text === command.command || text.startsWith(command.command + " ")) {
      try {
        await command.execute(bot, message);
      } catch (err) {
        console.error("Erro no comando:", err);
      }
      return;
    }
  }
};

export default MessageHandler;
