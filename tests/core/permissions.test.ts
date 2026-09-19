import { describe, it, expect } from "vitest";
import { canExecute, type AccessPolicy } from "../../src/core/permissions.js";

const DONO = "5500000000001@s.whatsapp.net";
const DONO_LID = "266100000000001@lid";
const ESTRANHO = "5511000000000@s.whatsapp.net";
const ESTRANHO_LID = "266199999999999@lid";
const GRUPO_OK = "120363000000000001@g.us";
const GRUPO_NAO = "120363999999999999@g.us";

const policy: AccessPolicy = { ownerJids: [DONO], allowedGroups: [GRUPO_OK] };

describe("canExecute", () => {
  it("permite o dono no privado", () => {
    expect(
      canExecute({ senderJid: DONO, senderAltJid: null, chatJid: DONO, isGroup: false }, policy),
    ).toBe(true);
  });

  it("bloqueia estranho no privado", () => {
    expect(
      canExecute(
        { senderJid: ESTRANHO, senderAltJid: null, chatJid: ESTRANHO, isGroup: false },
        policy,
      ),
    ).toBe(false);
  });

  it("permite o dono em grupo autorizado", () => {
    expect(
      canExecute(
        { senderJid: DONO, senderAltJid: null, chatJid: GRUPO_OK, isGroup: true },
        policy,
      ),
    ).toBe(true);
  });

  it("BLOQUEIA estranho em grupo autorizado", () => {
    expect(
      canExecute(
        { senderJid: ESTRANHO, senderAltJid: null, chatJid: GRUPO_OK, isGroup: true },
        policy,
      ),
    ).toBe(false);
  });

  it("bloqueia o dono em grupo não autorizado", () => {
    expect(
      canExecute(
        { senderJid: DONO, senderAltJid: null, chatJid: GRUPO_NAO, isGroup: true },
        policy,
      ),
    ).toBe(false);
  });

  it("bloqueia estranho em grupo não autorizado", () => {
    expect(
      canExecute(
        { senderJid: ESTRANHO, senderAltJid: null, chatJid: GRUPO_NAO, isGroup: true },
        policy,
      ),
    ).toBe(false);
  });

  it("bloqueia tudo quando a política está vazia", () => {
    const vazia: AccessPolicy = { ownerJids: [], allowedGroups: [] };
    expect(
      canExecute({ senderJid: DONO, senderAltJid: null, chatJid: DONO, isGroup: false }, vazia),
    ).toBe(false);
  });

  it("permite o dono em grupo LID quando senderJid é LID desconhecido mas senderAltJid é o telefone do dono", () => {
    // Caso real: Baileys endereça o grupo por LID, então senderJid nunca
    // bate contra OWNER_JIDS (que guarda @s.whatsapp.net). senderAltJid
    // carrega o telefone real e precisa ser aceito.
    expect(
      canExecute(
        { senderJid: DONO_LID, senderAltJid: DONO, chatJid: GRUPO_OK, isGroup: true },
        policy,
      ),
    ).toBe(true);
  });

  it("bloqueia quando senderJid E senderAltJid são ambos desconhecidos", () => {
    // A correção do LID não pode reabrir o furo de segurança: um estranho
    // com LID desconhecido e alt desconhecido continua bloqueado.
    expect(
      canExecute(
        { senderJid: ESTRANHO_LID, senderAltJid: ESTRANHO, chatJid: GRUPO_OK, isGroup: true },
        policy,
      ),
    ).toBe(false);
  });
});
