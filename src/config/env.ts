import "dotenv/config";

export type Env = {
  GEMINI_API_KEY: string;
  DB_PATH: string;
  OWNER_JIDS: string[];
  ALLOWED_GROUPS: string[];
};

type Source = Record<string, string | undefined>;

function required(source: Source, key: string): string {
  const value = source[key]?.trim();
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente ou vazia: ${key}`);
  }
  return value;
}

function optional(source: Source, key: string, fallback: string): string {
  return source[key]?.trim() || fallback;
}

function jidList(source: Source, key: string, { allowEmpty }: { allowEmpty: boolean }): string[] {
  const raw = source[key]?.trim() ?? "";
  const items = raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (items.length === 0) {
    if (allowEmpty) return [];
    throw new Error(`Variável de ambiente obrigatória ausente ou vazia: ${key}`);
  }

  for (const item of items) {
    if (!item.includes("@")) {
      throw new Error(
        `${key} espera JIDs completos (ex.: 5500000000001@s.whatsapp.net), mas recebeu "${item}"`,
      );
    }
  }
  return items;
}

export function loadEnv(source: Source): Env {
  return {
    GEMINI_API_KEY: required(source, "GEMINI_API_KEY"),
    DB_PATH: optional(source, "DB_PATH", "./data/bot.db"),
    OWNER_JIDS: jidList(source, "OWNER_JIDS", { allowEmpty: false }),
    ALLOWED_GROUPS: jidList(source, "ALLOWED_GROUPS", { allowEmpty: true }),
  };
}

export const env: Env = loadEnv(process.env);
