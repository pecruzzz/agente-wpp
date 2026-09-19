import { describe, it, expect } from "vitest";
import { loadEnv } from "../../src/config/env.js";

const valido = {
  GEMINI_API_KEY: "chave-abc",
  OWNER_JIDS: "5500000000001@s.whatsapp.net",
  ALLOWED_GROUPS: "120363000000000001@g.us",
};

describe("loadEnv", () => {
  it("lê uma configuração válida", () => {
    const env = loadEnv(valido);
    expect(env.GEMINI_API_KEY).toBe("chave-abc");
    expect(env.OWNER_JIDS).toEqual(["5500000000001@s.whatsapp.net"]);
    expect(env.ALLOWED_GROUPS).toEqual(["120363000000000001@g.us"]);
  });

  it("usa ./data/bot.db como DB_PATH padrão", () => {
    expect(loadEnv(valido).DB_PATH).toBe("./data/bot.db");
  });

  it("respeita DB_PATH explícito", () => {
    expect(loadEnv({ ...valido, DB_PATH: "/tmp/x.db" }).DB_PATH).toBe("/tmp/x.db");
  });

  it("aceita listas separadas por vírgula, com espaços", () => {
    const env = loadEnv({ ...valido, OWNER_JIDS: "a@s.whatsapp.net , b@s.whatsapp.net" });
    expect(env.OWNER_JIDS).toEqual(["a@s.whatsapp.net", "b@s.whatsapp.net"]);
  });

  it("aceita ALLOWED_GROUPS vazio", () => {
    expect(loadEnv({ ...valido, ALLOWED_GROUPS: "" }).ALLOWED_GROUPS).toEqual([]);
  });

  it("falha quando GEMINI_API_KEY está ausente", () => {
    const { GEMINI_API_KEY, ...resto } = valido;
    expect(() => loadEnv(resto)).toThrow(/GEMINI_API_KEY/);
  });

  it("falha quando GEMINI_API_KEY está vazia", () => {
    expect(() => loadEnv({ ...valido, GEMINI_API_KEY: "   " })).toThrow(/GEMINI_API_KEY/);
  });

  it("falha quando OWNER_JIDS está vazio", () => {
    expect(() => loadEnv({ ...valido, OWNER_JIDS: "" })).toThrow(/OWNER_JIDS/);
  });

  it("rejeita JID sem @, citando o valor ofensivo", () => {
    expect(() => loadEnv({ ...valido, OWNER_JIDS: "5500000000001" })).toThrow(/5500000000001/);
  });

  it("rejeita grupo sem @", () => {
    expect(() => loadEnv({ ...valido, ALLOWED_GROUPS: "120363000000000001" })).toThrow(/@/);
  });
});
