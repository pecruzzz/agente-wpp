import { describe, it, expect, vi } from "vitest";
import type { WASocket } from "baileys";
import { buildRouter, dispatch } from "../../src/core/router.js";
import type { Command } from "../../src/core/context.js";
import type { ParsedMessage } from "../../src/core/parser.js";
import type { AccessPolicy } from "../../src/core/permissions.js";

const DONO = "5500000000001@s.whatsapp.net";
const policy: AccessPolicy = { ownerJids: [DONO], allowedGroups: [] };

function parsed(command: string, args: string[] = []): ParsedMessage {
  return {
    raw: {} as never,
    chatJid: DONO,
    senderJid: DONO,
    senderAltJid: null,
    isGroup: false,
    pushName: "Pedro",
    text: [command, ...args].join(" "),
    command,
    args,
  };
}

function fakeBot() {
  return { sendMessage: vi.fn().mockResolvedValue(undefined) } as unknown as WASocket;
}

const oi: Command = {
  name: "oi",
  description: "cumprimenta",
  handler: async (ctx) => { await ctx.reply("olá"); },
};

describe("buildRouter", () => {
  it("indexa por nome", () => {
    expect(buildRouter([oi]).get("oi")).toBe(oi);
  });

  it("indexa por alias", () => {
    const cmd: Command = { ...oi, aliases: ["ola", "e-ai"] };
    const router = buildRouter([cmd]);
    expect(router.get("ola")).toBe(cmd);
    expect(router.get("e-ai")).toBe(cmd);
  });

  it("lança quando dois comandos disputam o mesmo nome", () => {
    expect(() => buildRouter([oi, { ...oi }])).toThrow(/oi/);
  });

  it("lança quando um alias colide com o nome de outro comando", () => {
    const outro: Command = { name: "tchau", description: "x", aliases: ["oi"], handler: async () => {} };
    expect(() => buildRouter([oi, outro])).toThrow(/oi/);
  });

  it("lança quando o nome não está normalizado", () => {
    const acentuado: Command = { ...oi, name: "Eustáquio" };
    expect(() => buildRouter([acentuado])).toThrow(/eustaquio/);
  });
});

describe("dispatch", () => {
  it("executa o comando e responde no chat de origem", async () => {
    const bot = fakeBot();
    await dispatch(buildRouter([oi]), bot, parsed("oi"), policy);
    expect(bot.sendMessage).toHaveBeenCalledWith(DONO, { text: "olá" });
  });

  it("passa os argumentos ao handler", async () => {
    const spy = vi.fn().mockResolvedValue(undefined);
    const cmd: Command = { name: "eco", description: "x", handler: spy };
    await dispatch(buildRouter([cmd]), fakeBot(), parsed("eco", ["a", "b"]), policy);
    expect(spy.mock.calls[0][0].args).toEqual(["a", "b"]);
  });

  it("ignora comando desconhecido em silêncio", async () => {
    const bot = fakeBot();
    await dispatch(buildRouter([oi]), bot, parsed("naoexiste"), policy);
    expect(bot.sendMessage).not.toHaveBeenCalled();
  });

  it("ignora mensagem sem comando", async () => {
    const bot = fakeBot();
    await dispatch(buildRouter([oi]), bot, { ...parsed("oi"), command: null }, policy);
    expect(bot.sendMessage).not.toHaveBeenCalled();
  });

  it("não executa comando de remetente não autorizado", async () => {
    const bot = fakeBot();
    const intruso = { ...parsed("oi"), senderJid: "5511000000000@s.whatsapp.net" };
    await dispatch(buildRouter([oi]), bot, intruso, policy);
    expect(bot.sendMessage).not.toHaveBeenCalled();
  });

  it("avisa o usuário quando o handler lança, sem propagar o erro", async () => {
    const bot = fakeBot();
    const quebrado: Command = {
      name: "quebra", description: "x",
      handler: async () => { throw new Error("boom"); },
    };
    await expect(
      dispatch(buildRouter([quebrado]), bot, parsed("quebra"), policy),
    ).resolves.toBeUndefined();
    expect(bot.sendMessage).toHaveBeenCalledWith(DONO, expect.objectContaining({
      text: expect.stringContaining("erro"),
    }));
  });
});
