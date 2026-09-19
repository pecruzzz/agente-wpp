import { describe, it, expect } from "vitest";
import type { WAMessage } from "baileys";
import { parseMessage, normalizeCommandToken } from "../../src/core/parser.js";

function privada(text: string, pushName = "Pedro"): WAMessage {
  return {
    key: { remoteJid: "5500000000001@s.whatsapp.net", fromMe: false, id: "AAA" },
    message: { conversation: text },
    pushName,
    messageTimestamp: 1700000000,
  } as unknown as WAMessage;
}

function grupo(
  text: string,
  participant = "5500000000002@s.whatsapp.net",
  participantAlt?: string,
): WAMessage {
  return {
    key: {
      remoteJid: "120363000000000001@g.us",
      fromMe: false,
      id: "BBB",
      participant,
      ...(participantAlt ? { participantAlt } : {}),
    },
    message: { conversation: text },
    pushName: "Fulano",
    messageTimestamp: 1700000000,
  } as unknown as WAMessage;
}

describe("normalizeCommandToken", () => {
  it("minuscula e remove acentos", () => {
    expect(normalizeCommandToken("Eustáquio")).toBe("eustaquio");
  });

  it("preserva ! e -", () => {
    expect(normalizeCommandToken("!ifood-x")).toBe("!ifood-x");
  });

  it("remove emoji e pontuação", () => {
    expect(normalizeCommandToken("oi👋,")).toBe("oi");
  });
});

describe("parseMessage", () => {
  it("extrai comando e argumentos de mensagem privada", () => {
    const parsed = parseMessage(privada("!ifood add pizza"))!;
    expect(parsed.command).toBe("!ifood");
    expect(parsed.args).toEqual(["add", "pizza"]);
    expect(parsed.isGroup).toBe(false);
    expect(parsed.chatJid).toBe("5500000000001@s.whatsapp.net");
    expect(parsed.senderJid).toBe("5500000000001@s.whatsapp.net");
    expect(parsed.pushName).toBe("Pedro");
  });

  it("PRESERVA a vírgula decimal nos argumentos", () => {
    const parsed = parseMessage(privada("!ifood add pizza - mania - 10,50 - credito"))!;
    expect(parsed.args.join(" ")).toBe("add pizza - mania - 10,50 - credito");
    expect(parsed.text).toBe("!ifood add pizza - mania - 10,50 - credito");
  });

  it("normaliza o acento do comando sem tocar nos argumentos", () => {
    const parsed = parseMessage(privada("Eustáquio qual é a capital da Bahia?"))!;
    expect(parsed.command).toBe("eustaquio");
    expect(parsed.args.join(" ")).toBe("qual é a capital da Bahia?");
  });

  it("em grupo, senderJid é o participante e chatJid é o grupo", () => {
    const parsed = parseMessage(grupo("oi"))!;
    expect(parsed.isGroup).toBe(true);
    expect(parsed.chatJid).toBe("120363000000000001@g.us");
    expect(parsed.senderJid).toBe("5500000000002@s.whatsapp.net");
  });

  it("lê extendedTextMessage", () => {
    const msg = {
      key: { remoteJid: "5500000000001@s.whatsapp.net", fromMe: false, id: "C" },
      message: { extendedTextMessage: { text: "oi" } },
      pushName: null,
      messageTimestamp: 1,
    } as unknown as WAMessage;
    expect(parseMessage(msg)!.command).toBe("oi");
  });

  it("lê legenda de imagem", () => {
    const msg = {
      key: { remoteJid: "5500000000001@s.whatsapp.net", fromMe: false, id: "D" },
      message: { imageMessage: { caption: "!ifood lista" } },
      pushName: null,
      messageTimestamp: 1,
    } as unknown as WAMessage;
    const parsed = parseMessage(msg)!;
    expect(parsed.command).toBe("!ifood");
    expect(parsed.args).toEqual(["lista"]);
  });

  it("devolve null quando não há conteúdo textual", () => {
    const msg = {
      key: { remoteJid: "5500000000001@s.whatsapp.net", fromMe: false, id: "E" },
      message: { imageMessage: {} },
      pushName: null,
      messageTimestamp: 1,
    } as unknown as WAMessage;
    expect(parseMessage(msg)).toBeNull();
  });

  it("devolve null quando falta remoteJid", () => {
    const msg = { key: { fromMe: false, id: "F" }, message: { conversation: "oi" } } as unknown as WAMessage;
    expect(parseMessage(msg)).toBeNull();
  });

  it("devolve null para texto só de espaços", () => {
    expect(parseMessage(privada("   "))).toBeNull();
  });

  it("ignora espaços múltiplos entre argumentos", () => {
    expect(parseMessage(privada("!ifood   add    pizza"))!.args).toEqual(["add", "pizza"]);
  });

  it("preserva LID do remetente", () => {
    const parsed = parseMessage(grupo("oi", "120000000000001@lid"))!;
    expect(parsed.senderJid).toBe("120000000000001@lid");
  });

  it("remove o sufixo de dispositivo do JID do remetente", () => {
    // A mesma pessoa em dispositivos diferentes precisa render o MESMO senderJid,
    // porque ele vira owner_jid na Fase 3.
    const parsed = parseMessage(grupo("oi", "5500000000002:12@s.whatsapp.net"))!;
    expect(parsed.senderJid).toBe("5500000000002@s.whatsapp.net");
  });

  it("em grupo com LID, senderJid é o LID e senderAltJid é o telefone real", () => {
    // Baileys 7 com addressing_mode "lid" põe o LID em key.participant e o
    // telefone em key.participantAlt (decode-wa-message.js:154). Sem
    // senderAltJid, o dono nunca bate contra OWNER_JIDS em grupos LID.
    const parsed = parseMessage(
      grupo("oi", "266100000000001@lid", "5500000000001@s.whatsapp.net"),
    )!;
    expect(parsed.senderJid).toBe("266100000000001@lid");
    expect(parsed.senderAltJid).toBe("5500000000001@s.whatsapp.net");
  });

  it("sem participantAlt, senderAltJid é null", () => {
    const parsed = parseMessage(grupo("oi", "5500000000002@s.whatsapp.net"))!;
    expect(parsed.senderAltJid).toBeNull();
  });

  it("em DM com remoteJidAlt, senderAltJid é preenchido", () => {
    const msg = {
      key: {
        remoteJid: "266100000000001@lid",
        remoteJidAlt: "5500000000001@s.whatsapp.net",
        fromMe: false,
        id: "G",
      },
      message: { conversation: "oi" },
      pushName: "Pedro",
      messageTimestamp: 1700000000,
    } as unknown as WAMessage;
    const parsed = parseMessage(msg)!;
    expect(parsed.isGroup).toBe(false);
    expect(parsed.senderJid).toBe("266100000000001@lid");
    expect(parsed.senderAltJid).toBe("5500000000001@s.whatsapp.net");
  });
});
