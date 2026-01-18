import { proto, WAMessage } from "baileys";
import { logger } from "../logger/logger.js";

export type FormattedMessage = {
  key: proto.IMessageKey;
  messageTimestamp: Number | Long | null;
  pushName: string | null;
  content: string | null;
  participant?: string | null; // grupos exigem
};
/**
 * @param message
 * @returns a message vindo do Baileys para algo mais amigável.
 */
export const getMessage = (
  message: WAMessage,
): FormattedMessage | undefined => {
  try {
    return {
      key: message.key,
      //@ts-ignore
      messageTimestamp: message.messageTimestamp,
      //@ts-ignore
      pushName: message.pushName,
      content:
        message.message?.conversation ||
        message.message?.extendedTextMessage?.text ||
        null,
      participant: message.key.participant ?? null,
    };
  } catch (error) {
    logger.error(error);
  }
};
