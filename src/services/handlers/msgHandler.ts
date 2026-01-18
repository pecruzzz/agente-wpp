import type { WASocket } from "baileys";
import type { FormattedMessage } from "./msgParser.js";
import { commands } from "../commands/index.js";
import { logger } from "../logger/logger.js";
import { canExecute } from "../../permissions.js";

const MessageHandler = async (bot: WASocket, message: FormattedMessage) => {
  const jid = message.key.remoteJid;
  if (!jid) return;

  if (!canExecute(message)) {
    logger.warn(`Bloqueado: ${jid}`);
    return;
  }

  console.log("TEXT RAW:", message.content);

  const text = message.content
    ?.toLowerCase()
    .replace(/[^\p{L}\p{N}\s!\-|]/gu, "")

    .trim();
  console.log("tratad:", text);
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
