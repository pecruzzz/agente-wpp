import type { WAMessage } from "baileys";
import { jidNormalizedUser, isJidGroup } from "baileys";

export type ParsedMessage = {
  raw: WAMessage;
  chatJid: string;
  senderJid: string;
  /**
   * Endereço alternativo do remetente. Baileys 7 com addressing_mode "lid"
   * põe o LID em senderJid (key.participant/remoteJid) e o telefone real
   * aqui (key.participantAlt/remoteJidAlt) — ou vice-versa. null quando o
   * evento não trouxe endereço alternativo.
   */
  senderAltJid: string | null;
  isGroup: boolean;
  pushName: string | null;
  text: string;
  command: string | null;
  args: string[];
};

/**
 * Normaliza um token de comando: minúsculas, sem acentos, sem emoji ou
 * pontuação. Preserva letras, números, `!`, `-` e `_`, que compõem nomes de
 * comando. NÃO deve ser aplicada a argumentos.
 */
export function normalizeCommandToken(token: string): string {
  return token
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}!_-]/gu, "");
}

function extractText(message: WAMessage): string | null {
  const content = message.message;
  if (!content) return null;
  return (
    content.conversation ??
    content.extendedTextMessage?.text ??
    content.imageMessage?.caption ??
    content.videoMessage?.caption ??
    null
  );
}

export function parseMessage(message: WAMessage): ParsedMessage | null {
  const chatJid = message.key.remoteJid;
  if (!chatJid) return null;

  const raw = extractText(message);
  if (!raw) return null;

  const text = raw.trim();
  if (!text) return null;

  const isGroup = isJidGroup(chatJid) === true;
  const senderRaw = isGroup ? (message.key.participant ?? chatJid) : chatJid;
  const altRaw = isGroup ? message.key.participantAlt : message.key.remoteJidAlt;

  const tokens = text.split(/\s+/);
  const command = normalizeCommandToken(tokens[0]) || null;

  return {
    raw: message,
    chatJid,
    senderJid: jidNormalizedUser(senderRaw),
    senderAltJid: altRaw ? jidNormalizedUser(altRaw) : null,
    isGroup,
    pushName: message.pushName ?? null,
    text,
    command,
    args: tokens.slice(1),
  };
}
