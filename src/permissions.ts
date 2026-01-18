import { ALLOWED_GROUPS, MY_JIDS } from "./configs.js";
import type { FormattedMessage } from "./services/handlers/msgParser.js";

export function canExecute(message: FormattedMessage): boolean {
  const jid = message.key.remoteJid;
  if (!jid) return false;

  const isGroup = jid.endsWith("@g.us");

  // Mensagem privada
  if (!isGroup) {
    return MY_JIDS.includes(jid);
  }

  // Grupo → compara JID completo
  return ALLOWED_GROUPS.includes(jid);
}
