import type { ParsedMessage } from "./parser.js";

export type AccessPolicy = {
  ownerJids: string[];
  allowedGroups: string[];
};

type Subject = Pick<ParsedMessage, "senderJid" | "senderAltJid" | "chatJid" | "isGroup">;

export function canExecute(message: Subject, policy: AccessPolicy): boolean {
  // Em grupos com addressing_mode LID, senderJid é o LID (nunca cadastrado
  // em OWNER_JIDS) e senderAltJid carrega o telefone real. Aceitar qualquer
  // um dos dois evita que todo comando em grupo LID pare de funcionar.
  const senderKnown =
    policy.ownerJids.includes(message.senderJid) ||
    (message.senderAltJid !== null && policy.ownerJids.includes(message.senderAltJid));

  if (!message.isGroup) {
    return senderKnown;
  }

  // Em grupo: o grupo precisa estar liberado E o remetente precisa ser conhecido.
  return policy.allowedGroups.includes(message.chatJid) && senderKnown;
}
