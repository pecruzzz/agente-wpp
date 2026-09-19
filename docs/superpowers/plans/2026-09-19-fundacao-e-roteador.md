# Fundação e Roteador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o bot capaz de sobreviver sozinho a quedas de conexão e substituir o casamento de comandos por prefixo por um roteador com parser único.

**Architecture:** O socket sai do escopo de módulo e passa a ser criado por uma factory (`startBot()`), o que viabiliza reconexão com backoff e, mais adiante, múltiplos sockets. A lógica de decisão de reconexão é extraída como função pura, testável sem rede. O casamento de comandos vira `Map` sobre um `ParsedMessage` produzido por um parser único, que normaliza **apenas** o token de comando e preserva os argumentos crus.

**Tech Stack:** TypeScript 5.9 (ESM, `NodeNext`, `strict`), Node 22+, Baileys `7.0.0-rc.9`, better-sqlite3, pino, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-19-wpp-bot-fundacao-design.md`

## Global Constraints

- **Escopo:** apenas Fases 1 e 2 do spec. Fase 3 (tabela `expenses`, migrações, `owner_jid`) e Fase 4 (lint, CI) ficam fora, salvo o Vitest, antecipado para viabilizar TDD.
- **Desvio registrado do spec:** o spec coloca o Vitest na Fase 4. Este plano o antecipa para a Task 1, porque TDD exige o teste antes do código. Nenhum outro item da Fase 4 é antecipado.
- **ESM estrito:** todo import relativo termina em `.js`, inclusive apontando para arquivos `.ts`. É exigência de `moduleResolution: NodeNext`.
- **Zero `@ts-ignore` novos.** O código atual tem cinco; ao final deste plano devem ser zero.
- **Zero `console.log` / `console.error` novos.** Use `logger` (pino).
- **JIDs em configuração são completos** — `5500000000001@s.whatsapp.net`, `120363000000000001@g.us` — nunca números soltos.
- **Testes ficam em `tests/`**, espelhando `src/`. Não colocar testes em `src/`: `tsconfig.json` tem `rootDir: "./src"` e eles acabariam em `dist/`.
- **Não tocar no schema do banco.** É Fase 3. A única mudança permitida em
  `src/services/db/db.ts` é trocar a origem de `DB_PATH` (Task 2, Step 7).
- **Não tocar no diretório `auth/`** nem no `.env` — credenciais reais.
- Cada task termina com `npx tsc --noEmit` limpo e `npx vitest run` verde.

## Estrutura de arquivos

| Arquivo | Responsabilidade | Task |
|---|---|---|
| `vitest.config.ts` | configuração de teste | 1 |
| `src/config/env.ts` | ler e validar ambiente; falhar alto no boot | 2 |
| `src/core/parser.ts` | `WAMessage` → `ParsedMessage` | 3 |
| `src/core/permissions.ts` | autorização por remetente e chat | 4 |
| `src/core/context.ts` | tipos `Command` e `CommandContext` | 5 |
| `src/core/router.ts` | `Map` de comandos, dispatch, tratamento de erro | 5 |
| `src/commands/{oi,ifood,eustaquio}.ts` | comandos migrados | 6 |
| `src/bootstrap/reconnect.ts` | decisão pura de reconexão | 7 |
| `src/bootstrap/connection.ts` | `startBot()`, listeners, ciclo de reconexão | 8 |
| `src/bootstrap/shutdown.ts` | sinais e erros globais de processo | 9 |
| `src/index.ts` | apenas invoca o bootstrap | 9 |

**Removidos ao final:** `src/configs.ts`, `src/permissions.ts`, `src/services/handlers/msgParser.ts`, `src/services/handlers/msgHandler.ts`, `src/services/commands/` (conteúdo migrado para `src/commands/`).

---

### Task 1: Ferramental de teste

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/smoke.test.ts`
- Modify: `package.json` (scripts e devDependencies)
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nada.
- Produces: comandos `npm test`, `npm run test:watch`, `npm run typecheck`. Todas as tasks seguintes dependem deles.

- [ ] **Step 1: Instalar o Vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Criar `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 3: Escrever o teste de fumaça**

Arquivo `tests/smoke.test.ts`. Ele existe só para provar que o runner funciona; a Task 2 o substitui por testes reais.

```ts
import { describe, it, expect } from "vitest";

describe("ferramental", () => {
  it("roda testes", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: Corrigir os scripts do `package.json`**

Substitua o bloco `"scripts"` inteiro por este. O script `gemini` é removido: aponta para `gemini.ts`, que não existe no repositório.

```json
  "scripts": {
    "dev": "node --import 'data:text/javascript,import { register } from \"node:module\"; import { pathToFileURL } from \"node:url\"; register(\"ts-node/esm\", pathToFileURL(\"./\"));' src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
```

- [ ] **Step 5: Rodar o teste e verificar que passa**

Run: `npm test`
Expected: PASS, 1 teste.

- [ ] **Step 6: Verificar que o build funciona**

Run: `npm run build && ls dist/index.js`
Expected: `dist/index.js` existe. Se `tsc` falhar, pare e corrija antes de seguir — as tasks seguintes assumem build limpo.

- [ ] **Step 7: Garantir que `dist/` e `data/` estão ignorados**

`.gitignore` deve conter `dist/` (já contém) e ganhar uma linha `data/`. **Não** remova ainda a linha `configs.ts` — `src/configs.ts` só deixa de existir na Task 9.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests/smoke.test.ts .gitignore
git commit -m "chore: configura vitest e corrige scripts do npm"
```

---

### Task 2: Configuração por ambiente

**Files:**
- Create: `src/config/env.ts`
- Create: `tests/config/env.test.ts`
- Create: `.env.example`
- Delete: `tests/smoke.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type Env = { GEMINI_API_KEY: string; DB_PATH: string; OWNER_JIDS: string[]; ALLOWED_GROUPS: string[] }`
  - `loadEnv(source: Record<string, string | undefined>): Env` — pura, lança `Error` em entrada inválida. Testável sem mexer em `process.env`.
  - `env: Env` — instância única, `loadEnv(process.env)`, avaliada no import.

- [ ] **Step 1: Escrever os testes que falham**

Arquivo `tests/config/env.test.ts`. Note o caso do JID sem `@`: é o erro que a configuração atual permite, já que `configs.ts` guarda números soltos e deriva o JID em código.

```ts
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
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run tests/config/env.test.ts`
Expected: FAIL — não consegue resolver `../../src/config/env.js`.

- [ ] **Step 3: Implementar `src/config/env.ts`**

```ts
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
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run tests/config/env.test.ts`
Expected: PASS, 10 testes.

- [ ] **Step 5: Criar `.env.example`**

Este arquivo **é versionado** — é o que conserta o "clone novo não compila".

```bash
GEMINI_API_KEY=coloque-sua-chave-aqui
DB_PATH=./data/bot.db
OWNER_JIDS=5511999999999@s.whatsapp.net
ALLOWED_GROUPS=120363000000000000@g.us,5511999999999-1600000000@g.us
```

- [ ] **Step 6: Preencher o `.env` real**

O `.env` local hoje só tem `GEMINI_API_KEY`. Acrescente `OWNER_JIDS` e `ALLOWED_GROUPS` copiando os valores de `src/configs.ts`, **convertidos para JID completo**: cada número de `MEU_NUMERO` vira `<numero>@s.whatsapp.net`; os grupos de `ALLOWED_GROUPS` já estão em formato JID e são copiados como estão. Não comite o `.env` — ele está no `.gitignore`.

- [ ] **Step 7: Repontar `src/services/db/db.ts` para o novo env**

`db.ts` hoje importa `DB_PATH` de `../../configs.js`, arquivo que a Task 9 remove. Troque **apenas a linha do import** — nada mais nesse arquivo:

```ts
import { env } from "../../config/env.js";
```

e a linha de uso:

```ts
db = new Database(env.DB_PATH);
```

- [ ] **Step 8: Mover o banco existente para `data/`**

O `DB_PATH` padrão passou a ser `./data/bot.db`, mas o banco atual está em `./bot.db` com 6 lançamentos. Sem mover, o bot sobe com banco vazio e os dados parecem ter sumido.

```bash
mkdir -p data && cp bot.db data/bot.db
node -e "const D=require('better-sqlite3');console.log(new D('data/bot.db',{readonly:true}).prepare('select count(*) c from ifood').get())"
```
Expected: `{ c: 6 }`. Mantenha o `./bot.db` original onde está, como backup, até o teste manual da Task 9 passar.

- [ ] **Step 9: Remover o teste de fumaça e rodar tudo**

```bash
rm tests/smoke.test.ts
npm test && npm run typecheck
```
Expected: PASS, sem erro de tipo.

- [ ] **Step 10: Commit**

```bash
git add src/config/env.ts tests/config/env.test.ts .env.example src/services/db/db.ts
git rm --cached -q tests/smoke.test.ts 2>/dev/null; git add -A tests/
git commit -m "feat: configuracao por ambiente com validacao no boot"
```

---

### Task 3: Parser de mensagens

**Files:**
- Create: `src/core/parser.ts`
- Create: `tests/core/parser.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type ParsedMessage = { raw: WAMessage; chatJid: string; senderJid: string; isGroup: boolean; pushName: string | null; text: string; command: string | null; args: string[] }`
  - `parseMessage(message: WAMessage): ParsedMessage | null` — `null` quando não há JID de chat ou não há conteúdo textual.
  - `normalizeCommandToken(token: string): string` — exportada para a Task 5 validar nomes de comandos no boot.

**Regra central:** normalizar **somente** o token de comando; preservar `args` exatamente como digitados. É isso que conserta `10,50` de verdade — hoje a vírgula sobrevive no comando mas some no casamento, e o fluxo funciona por acidente.

- [ ] **Step 1: Escrever os testes que falham**

Arquivo `tests/core/parser.test.ts`.

```ts
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

function grupo(text: string, participant = "5500000000003@s.whatsapp.net"): WAMessage {
  return {
    key: { remoteJid: "120363000000000001@g.us", fromMe: false, id: "BBB", participant },
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
    expect(parsed.senderJid).toBe("5500000000003@s.whatsapp.net");
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
    const parsed = parseMessage(grupo("oi", "5500000000003:12@s.whatsapp.net"))!;
    expect(parsed.senderJid).toBe("5500000000003@s.whatsapp.net");
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run tests/core/parser.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar `src/core/parser.ts`**

```ts
import type { WAMessage } from "baileys";
import { jidNormalizedUser, isJidGroup } from "baileys";

export type ParsedMessage = {
  raw: WAMessage;
  chatJid: string;
  senderJid: string;
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

  const tokens = text.split(/\s+/);
  const command = normalizeCommandToken(tokens[0]) || null;

  return {
    raw: message,
    chatJid,
    senderJid: jidNormalizedUser(senderRaw),
    isGroup,
    pushName: message.pushName ?? null,
    text,
    command,
    args: tokens.slice(1),
  };
}
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run tests/core/parser.test.ts`
Expected: PASS, 15 testes.

Comportamento de `jidNormalizedUser` verificado nesta versão do Baileys: `120000000000001@lid` → `120000000000001@lid` (LID preservado) e `5500000000003:12@s.whatsapp.net` → `5500000000003@s.whatsapp.net` (sufixo de dispositivo removido). Os testes assumem exatamente isso.

- [ ] **Step 5: Verificar tipos**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/core/parser.ts tests/core/parser.test.ts
git commit -m "feat: parser unico de mensagens preservando argumentos crus"
```

---

### Task 4: Permissões por remetente

**Files:**
- Create: `src/core/permissions.ts`
- Create: `tests/core/permissions.test.ts`

**Interfaces:**
- Consumes: `ParsedMessage` da Task 3.
- Produces:
  - `type AccessPolicy = { ownerJids: string[]; allowedGroups: string[] }`
  - `canExecute(message: Pick<ParsedMessage, "senderJid" | "chatJid" | "isGroup">, policy: AccessPolicy): boolean`

A política entra por parâmetro em vez de ser importada de `env` — é o que torna a função testável sem mexer em `process.env`.

**Regra nova:** em grupo, hoje basta o grupo estar liberado, e qualquer participante pode remover lançamentos ou gastar a cota do Gemini. Passa a exigir grupo autorizado **e** remetente conhecido.

- [ ] **Step 1: Escrever os testes que falham**

```ts
import { describe, it, expect } from "vitest";
import { canExecute, type AccessPolicy } from "../../src/core/permissions.js";

const DONO = "5500000000001@s.whatsapp.net";
const ESTRANHO = "5511000000000@s.whatsapp.net";
const GRUPO_OK = "120363000000000001@g.us";
const GRUPO_NAO = "120363999999999999@g.us";

const policy: AccessPolicy = { ownerJids: [DONO], allowedGroups: [GRUPO_OK] };

describe("canExecute", () => {
  it("permite o dono no privado", () => {
    expect(canExecute({ senderJid: DONO, chatJid: DONO, isGroup: false }, policy)).toBe(true);
  });

  it("bloqueia estranho no privado", () => {
    expect(canExecute({ senderJid: ESTRANHO, chatJid: ESTRANHO, isGroup: false }, policy)).toBe(false);
  });

  it("permite o dono em grupo autorizado", () => {
    expect(canExecute({ senderJid: DONO, chatJid: GRUPO_OK, isGroup: true }, policy)).toBe(true);
  });

  it("BLOQUEIA estranho em grupo autorizado", () => {
    expect(canExecute({ senderJid: ESTRANHO, chatJid: GRUPO_OK, isGroup: true }, policy)).toBe(false);
  });

  it("bloqueia o dono em grupo não autorizado", () => {
    expect(canExecute({ senderJid: DONO, chatJid: GRUPO_NAO, isGroup: true }, policy)).toBe(false);
  });

  it("bloqueia estranho em grupo não autorizado", () => {
    expect(canExecute({ senderJid: ESTRANHO, chatJid: GRUPO_NAO, isGroup: true }, policy)).toBe(false);
  });

  it("bloqueia tudo quando a política está vazia", () => {
    const vazia: AccessPolicy = { ownerJids: [], allowedGroups: [] };
    expect(canExecute({ senderJid: DONO, chatJid: DONO, isGroup: false }, vazia)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run tests/core/permissions.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar `src/core/permissions.ts`**

```ts
import type { ParsedMessage } from "./parser.js";

export type AccessPolicy = {
  ownerJids: string[];
  allowedGroups: string[];
};

type Subject = Pick<ParsedMessage, "senderJid" | "chatJid" | "isGroup">;

export function canExecute(message: Subject, policy: AccessPolicy): boolean {
  const senderKnown = policy.ownerJids.includes(message.senderJid);

  if (!message.isGroup) {
    return senderKnown;
  }

  // Em grupo: o grupo precisa estar liberado E o remetente precisa ser conhecido.
  return policy.allowedGroups.includes(message.chatJid) && senderKnown;
}
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run tests/core/permissions.test.ts`
Expected: PASS, 7 testes.

- [ ] **Step 5: Commit**

```bash
git add src/core/permissions.ts tests/core/permissions.test.ts
git commit -m "feat: permissoes exigem remetente conhecido tambem em grupo"
```

---

### Task 5: Contexto e roteador

**Files:**
- Create: `src/core/context.ts`
- Create: `src/core/router.ts`
- Create: `tests/core/router.test.ts`

**Interfaces:**
- Consumes: `ParsedMessage` (Task 3), `canExecute` e `AccessPolicy` (Task 4).
- Produces:
  - `type CommandContext = ParsedMessage & { bot: WASocket; reply: (text: string) => Promise<void> }`
  - `type Command = { name: string; aliases?: string[]; description: string; handler: (ctx: CommandContext) => Promise<void> }`
  - `buildRouter(commands: Command[]): Map<string, Command>` — lança no boot em nome duplicado ou não normalizado.
  - `createContext(bot: WASocket, parsed: ParsedMessage): CommandContext`
  - `dispatch(router, bot, parsed, policy): Promise<void>`

- [ ] **Step 1: Escrever os testes que falham**

```ts
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
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run tests/core/router.test.ts`
Expected: FAIL — módulos não encontrados.

- [ ] **Step 3: Implementar `src/core/context.ts`**

```ts
import type { WASocket } from "baileys";
import type { ParsedMessage } from "./parser.js";

export type CommandContext = ParsedMessage & {
  bot: WASocket;
  /** Responde no chat de origem. Evita repetir sendMessage(remoteJid!, …). */
  reply: (text: string) => Promise<void>;
};

export type Command = {
  /** Deve estar normalizado: minúsculo e sem acentos. Ver normalizeCommandToken. */
  name: string;
  aliases?: string[];
  description: string;
  handler: (ctx: CommandContext) => Promise<void>;
};

export function createContext(bot: WASocket, parsed: ParsedMessage): CommandContext {
  return {
    ...parsed,
    bot,
    reply: async (text: string) => {
      await bot.sendMessage(parsed.chatJid, { text });
    },
  };
}
```

- [ ] **Step 4: Implementar `src/core/router.ts`**

```ts
import type { WASocket } from "baileys";
import { logger } from "../services/logger/logger.js";
import { normalizeCommandToken, type ParsedMessage } from "./parser.js";
import { canExecute, type AccessPolicy } from "./permissions.js";
import { createContext, type Command } from "./context.js";

export type Router = Map<string, Command>;

export function buildRouter(commands: Command[]): Router {
  const router: Router = new Map();

  for (const command of commands) {
    const keys = [command.name, ...(command.aliases ?? [])];
    for (const key of keys) {
      const normalized = normalizeCommandToken(key);
      if (normalized !== key) {
        throw new Error(
          `Comando "${key}" não está normalizado; use "${normalized}" (minúsculo, sem acento).`,
        );
      }
      if (router.has(key)) {
        throw new Error(`Comando duplicado: "${key}" já está registrado.`);
      }
      router.set(key, command);
    }
  }

  return router;
}

export async function dispatch(
  router: Router,
  bot: WASocket,
  parsed: ParsedMessage,
  policy: AccessPolicy,
): Promise<void> {
  if (!parsed.command) return;

  const command = router.get(parsed.command);
  if (!command) return;

  if (!canExecute(parsed, policy)) {
    logger.warn({ sender: parsed.senderJid, chat: parsed.chatJid }, "Comando bloqueado");
    return;
  }

  const ctx = createContext(bot, parsed);

  try {
    await command.handler(ctx);
  } catch (error) {
    logger.error({ err: error, command: command.name }, "Falha ao executar comando");
    try {
      await ctx.reply("Deu erro ao executar esse comando. Tenta de novo daqui a pouco.");
    } catch (replyError) {
      logger.error({ err: replyError }, "Falha ao avisar o usuário sobre o erro");
    }
  }
}
```

Note a ordem: o comando é resolvido **antes** da checagem de permissão, para que mensagens comuns de pessoas não autorizadas não poluam o log com avisos de bloqueio.

- [ ] **Step 5: Rodar e verificar que passa**

Run: `npx vitest run tests/core/router.test.ts`
Expected: PASS, 11 testes.

- [ ] **Step 6: Rodar a suíte inteira e os tipos**

Run: `npm test && npm run typecheck`
Expected: tudo verde.

- [ ] **Step 7: Commit**

```bash
git add src/core/context.ts src/core/router.ts tests/core/router.test.ts
git commit -m "feat: roteador por Map com contexto de comando e reply"
```

---

### Task 6: Migrar os comandos existentes

**Files:**
- Create: `src/commands/oi.ts`, `src/commands/ifood.ts`, `src/commands/eustaquio.ts`, `src/commands/index.ts`
- Create: `tests/commands/ifood.test.ts`
- Delete: `src/services/commands/` (diretório inteiro)

**Interfaces:**
- Consumes: `Command` e `CommandContext` (Task 5), `env` (Task 2).
- Produces: `commands: Command[]` exportado de `src/commands/index.ts`, consumido pela Task 8.

**Mudanças de comportamento nesta task:**
1. **Correção de bug:** `ifoodCommands.ts:109` responde "removido com sucesso" antes de checar `result.changes === 0`; com ID inexistente o bot manda duas mensagens, uma falsa. A checagem passa a vir primeiro.
2. Os handlers deixam de refatiar `message.content` — recebem `ctx.args` pronto.
3. O comando `eustaquio` passa a usar `systemInstruction` separada de `contents`. **Isto é apenas a separação estrutural**, que sai de graça na migração; timeout, retry e rate limit continuam fora de escopo, conforme o spec.

- [ ] **Step 1: Escrever o teste do bug de remoção**

Arquivo `tests/commands/ifood.test.ts`. Testa a função de formatação da resposta, extraída justamente para ser testável sem banco.

```ts
import { describe, it, expect } from "vitest";
import { formatRemoveResult } from "../../src/commands/ifood.js";

describe("formatRemoveResult", () => {
  it("confirma quando removeu", () => {
    expect(formatRemoveResult(7, 1)).toContain("7");
    expect(formatRemoveResult(7, 1)).toContain("removido");
  });

  it("NÃO confirma remoção quando nada foi removido", () => {
    const msg = formatRemoveResult(999, 0);
    expect(msg).not.toContain("removido com sucesso");
    expect(msg).toMatch(/nenhum lançamento/i);
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run tests/commands/ifood.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Criar `src/commands/oi.ts`**

```ts
import type { Command } from "../core/context.js";

const oi: Command = {
  name: "oi",
  description: "Responde a um cumprimento",
  handler: async (ctx) => {
    await ctx.reply("Olá! Eu sou o Eustáquio, bot de testes do Pedro");
  },
};

export default oi;
```

- [ ] **Step 4: Criar `src/commands/ifood.ts`**

Porte o conteúdo de `src/services/commands/ifoodCommands.ts` preservando as queries SQL e o texto das mensagens, com estas mudanças: `ctx.args` no lugar do refatiamento manual; `ctx.reply` no lugar de `bot.sendMessage(remoteJid!, …)`; `formatRemoveResult` extraída; `logger` no lugar de qualquer `console`.

```ts
import type { Command } from "../core/context.js";
import db from "../services/db/db.js";
import { logger } from "../services/logger/logger.js";

function formatDate(value?: string): string {
  if (!value) return "—";
  const iso = value.replace(" ", "T") + "Z";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

/** Extraída para ser testável sem banco. Corrige o bug da resposta otimista. */
export function formatRemoveResult(id: number, changes: number): string {
  if (changes === 0) {
    return "❌ Nenhum lançamento encontrado com esse ID";
  }
  return `🗑️ Lançamento ${id} removido com sucesso`;
}

const AJUDA =
  "Use:\n" +
  "!ifood add item - loja - valor - credito/debito\n" +
  "!ifood remove <id>\n" +
  "!ifood lista\n" +
  "!ifood total";

const ifood: Command = {
  name: "!ifood",
  description: "Controle de gastos do iFood",
  handler: async (ctx) => {
    const action = ctx.args[0]?.toLowerCase();
    if (!action) {
      await ctx.reply(AJUDA);
      return;
    }

    if (action === "add") {
      const itens = ctx.args.slice(1).join(" ").split("-").map((p) => p.trim());
      if (itens.length !== 4) {
        await ctx.reply("❌ Formato inválido\n" + AJUDA);
        return;
      }

      const [item, loja, valorStr, pagamento] = itens;
      const valor = Number(valorStr.replace(",", "."));

      if (Number.isNaN(valor)) {
        await ctx.reply("❌ Valor inválido");
        return;
      }
      if (!["credito", "debito"].includes(pagamento.toLowerCase())) {
        await ctx.reply("❌ Pagamento deve ser credito ou debito");
        return;
      }

      const result = db
        .prepare("INSERT INTO ifood (item, loja, valor, pagamento) VALUES (?, ?, ?, ?)")
        .run(item, loja, valor, pagamento.toLowerCase());

      logger.info({ id: result.lastInsertRowid }, "Lançamento em ifood");

      await ctx.reply(
        `✅ Lançamento registrado\n` +
          `🆔 ID: ${result.lastInsertRowid}\n` +
          `🍔 Item: ${item}\n` +
          `🏪 Loja: ${loja}\n` +
          `💰 Valor: R$ ${valor.toFixed(2)}\n` +
          `💳 Pagamento: ${pagamento.toLowerCase()}`,
      );
      return;
    }

    if (action === "remove") {
      const id = Number(ctx.args[1]);
      if (!Number.isInteger(id)) {
        await ctx.reply("❌ ID inválido");
        return;
      }
      const result = db.prepare("DELETE FROM ifood WHERE id = ?").run(id);
      await ctx.reply(formatRemoveResult(id, result.changes));
      return;
    }

    if (action === "lista") {
      const rows = db.prepare("SELECT * FROM ifood ORDER BY id").all() as Array<{
        id: number; item: string; loja: string; valor: number;
        pagamento: string | null; created_at: string;
      }>;

      if (rows.length === 0) {
        await ctx.reply("Lista vazia!");
        return;
      }

      await ctx.reply(
        "🛒 iFood:\n\n" +
          "ID | Item | Loja | Valor | Pagamento | Criado em\n" +
          rows
            .map(
              (r) =>
                `${r.id} | ${r.item} | *${r.loja}* | R$ ${r.valor
                  .toFixed(2)
                  .replace(".", ",")} | ${r.pagamento} | ${formatDate(r.created_at)}`,
            )
            .join("\n"),
      );
      return;
    }

    if (action === "total") {
      const result = db
        .prepare(
          `SELECT SUM(valor) AS total FROM ifood
           WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', '-3 hours')`,
        )
        .get() as { total: number | null };

      await ctx.reply(
        `Total de compras no ifood nesse mês: R$ ${(result.total ?? 0).toFixed(2)}`,
      );
      return;
    }

    await ctx.reply(`❌ Ação desconhecida: ${action}\n\n${AJUDA}`);
  },
};

export default ifood;
```

O `try/catch` por ação desaparece: o `dispatch` da Task 5 já captura, loga e avisa o usuário. Era duplicação.

- [ ] **Step 5: Criar `src/commands/eustaquio.ts`**

Nome normalizado (`eustaquio`, sem acento) — o parser já remove o acento do que o usuário digitar, então "Eustáquio" continua funcionando.

```ts
import { GoogleGenAI } from "@google/genai";
import type { Command } from "../core/context.js";
import { env } from "../config/env.js";

const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

const SYSTEM_INSTRUCTION =
  "Você é um bot de assistência virtual chamado Eustáquio. " +
  "Não repita seu nome a cada resposta. " +
  "Nunca use formatação rich text, como **negrito**. " +
  "Responda de forma breve e direta.";

const eustaquio: Command = {
  name: "eustaquio",
  description: "Pergunta algo ao assistente de IA",
  handler: async (ctx) => {
    const pergunta = ctx.args.join(" ").trim();
    if (!pergunta) {
      await ctx.reply("Manda a pergunta junto: eustáquio qual a capital da Bahia?");
      return;
    }

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [pergunta],
      config: { systemInstruction: SYSTEM_INSTRUCTION },
    });

    await ctx.reply(response.text ?? "Não consegui responder agora.");
  },
};

export default eustaquio;
```

- [ ] **Step 6: Criar `src/commands/index.ts`**

```ts
import type { Command } from "../core/context.js";
import oi from "./oi.js";
import ifood from "./ifood.js";
import eustaquio from "./eustaquio.js";

export const commands: Command[] = [oi, ifood, eustaquio];
```

- [ ] **Step 7: Rodar os testes**

Run: `npx vitest run tests/commands/ifood.test.ts`
Expected: PASS, 2 testes.

- [ ] **Step 8: Remover os comandos antigos**

```bash
git rm -r src/services/commands
```

`npm run typecheck` vai acusar `src/services/handlers/msgHandler.ts`, que importava esse diretório. É esperado: a Task 9 remove os handlers antigos. Siga para a Task 7.

- [ ] **Step 9: Commit**

```bash
git add src/commands tests/commands
git commit -m "feat: migra comandos para o roteador e corrige resposta falsa do remove"
```

---

### Task 7: Decisão de reconexão

**Files:**
- Create: `src/bootstrap/reconnect.ts`
- Create: `tests/bootstrap/reconnect.test.ts`

**Interfaces:**
- Consumes: `DisconnectReason` do Baileys.
- Produces:
  - `type ReconnectDecision = { action: "reconnect"; delayMs: number } | { action: "stop"; reason: string }`
  - `decideReconnect(statusCode: number | undefined, attempt: number): ReconnectDecision`
  - `BACKOFF_BASE_MS = 1000`, `BACKOFF_MAX_MS = 60000`

A decisão é extraída como função pura justamente para ser testável sem rede. `attempt` é 0 na primeira falha após uma conexão bem-sucedida.

Valores confirmados no Baileys 7.0.0-rc.9: `loggedOut=401`, `badSession=500`, `restartRequired=515`, `connectionClosed=428`, `connectionLost=408`, `connectionReplaced=440`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
import { describe, it, expect } from "vitest";
import { DisconnectReason } from "baileys";
import { decideReconnect, BACKOFF_BASE_MS, BACKOFF_MAX_MS } from "../../src/bootstrap/reconnect.js";

describe("decideReconnect", () => {
  it("para de vez em loggedOut", () => {
    const d = decideReconnect(DisconnectReason.loggedOut, 0);
    expect(d.action).toBe("stop");
    if (d.action === "stop") expect(d.reason).toMatch(/QR/i);
  });

  it("para de vez em badSession", () => {
    expect(decideReconnect(DisconnectReason.badSession, 0).action).toBe("stop");
  });

  it("reconecta imediatamente em restartRequired", () => {
    const d = decideReconnect(DisconnectReason.restartRequired, 0);
    expect(d).toEqual({ action: "reconnect", delayMs: 0 });
  });

  it("reconecta imediatamente em restartRequired mesmo após várias tentativas", () => {
    expect(decideReconnect(DisconnectReason.restartRequired, 9)).toEqual({
      action: "reconnect", delayMs: 0,
    });
  });

  it("aplica backoff exponencial em connectionLost", () => {
    const d0 = decideReconnect(DisconnectReason.connectionLost, 0);
    const d1 = decideReconnect(DisconnectReason.connectionLost, 1);
    const d2 = decideReconnect(DisconnectReason.connectionLost, 2);
    expect(d0.action).toBe("reconnect");
    if (d0.action === "reconnect" && d1.action === "reconnect" && d2.action === "reconnect") {
      expect(d0.delayMs).toBeGreaterThanOrEqual(BACKOFF_BASE_MS);
      expect(d0.delayMs).toBeLessThan(BACKOFF_BASE_MS * 2);
      expect(d1.delayMs).toBeGreaterThanOrEqual(BACKOFF_BASE_MS * 2);
      expect(d1.delayMs).toBeLessThan(BACKOFF_BASE_MS * 4);
      expect(d2.delayMs).toBeGreaterThanOrEqual(BACKOFF_BASE_MS * 4);
      expect(d2.delayMs).toBeLessThan(BACKOFF_BASE_MS * 8);
    }
  });

  it("limita o backoff ao teto", () => {
    for (const attempt of [10, 20, 50]) {
      const d = decideReconnect(DisconnectReason.connectionClosed, attempt);
      expect(d.action).toBe("reconnect");
      if (d.action === "reconnect") {
        expect(d.delayMs).toBeLessThanOrEqual(BACKOFF_MAX_MS);
        expect(d.delayMs).toBeGreaterThan(0);
      }
    }
  });

  it("reconecta com backoff quando o statusCode é desconhecido", () => {
    expect(decideReconnect(undefined, 0).action).toBe("reconnect");
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run tests/bootstrap/reconnect.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar `src/bootstrap/reconnect.ts`**

```ts
import { DisconnectReason } from "baileys";

export const BACKOFF_BASE_MS = 1000;
export const BACKOFF_MAX_MS = 60000;

export type ReconnectDecision =
  | { action: "reconnect"; delayMs: number }
  | { action: "stop"; reason: string };

/**
 * Decide se e quando reconectar, a partir do statusCode do Boom em
 * lastDisconnect.error. Pura: não dorme, não conecta, não loga.
 *
 * @param attempt 0 na primeira falha após uma conexão bem-sucedida.
 */
export function decideReconnect(
  statusCode: number | undefined,
  attempt: number,
): ReconnectDecision {
  if (statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.badSession) {
    return {
      action: "stop",
      reason:
        "Sessão inválida: o WhatsApp desconectou este dispositivo. " +
        "Apague o diretório auth/ e escaneie o QR novamente.",
    };
  }

  // Parte normal do pareamento: o WhatsApp pede restart e espera reconexão já.
  if (statusCode === DisconnectReason.restartRequired) {
    return { action: "reconnect", delayMs: 0 };
  }

  const exponential = Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_MAX_MS);
  // Jitter de até 100% do passo, para não sincronizar tentativas.
  const jitter = Math.random() * exponential;
  const delayMs = Math.min(Math.round(exponential + jitter), BACKOFF_MAX_MS);

  return { action: "reconnect", delayMs };
}
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run tests/bootstrap/reconnect.test.ts`
Expected: PASS, 7 testes.

Atenção: o teste do backoff exponencial exige `delayMs` em `[passo, 2×passo)`. A fórmula acima satisfaz isso enquanto `exponential < BACKOFF_MAX_MS`. Para `attempt` alto, o `Math.min` final segura no teto, coberto pelo teste seguinte.

- [ ] **Step 5: Commit**

```bash
git add src/bootstrap/reconnect.ts tests/bootstrap/reconnect.test.ts
git commit -m "feat: politica pura de reconexao com backoff exponencial"
```

---

### Task 8: Bootstrap da conexão

**Files:**
- Create: `src/bootstrap/connection.ts`

**Interfaces:**
- Consumes: `env` (Task 2), `parseMessage` (Task 3), `AccessPolicy` (Task 4), `buildRouter`/`dispatch` (Task 5), `commands` (Task 6), `decideReconnect` (Task 7), `state`/`saveCreds` de `src/auth.ts`.
- Produces: `startBot(): Promise<WASocket>` e `stopBot(): Promise<void>`, consumidos pela Task 9.

Sem teste automatizado: esta task é integração com socket real. É verificada manualmente no Step 3. A lógica que **dá** para testar já foi isolada nas Tasks 3–7 — é exatamente por isso que elas vieram antes.

- [ ] **Step 1: Implementar `src/bootstrap/connection.ts`**

```ts
import makeWASocket, {
  Browsers,
  DisconnectReason,
  type WASocket,
  type WAMessage,
} from "baileys";
import { Boom } from "@hapi/boom";
import NodeCache from "node-cache";
import QRCode from "qrcode";

import { logger } from "../services/logger/logger.js";
import { env } from "../config/env.js";
import { state, saveCreds } from "../auth.js";
import { parseMessage } from "../core/parser.js";
import { buildRouter, dispatch } from "../core/router.js";
import { commands } from "../commands/index.js";
import type { AccessPolicy } from "../core/permissions.js";
import { decideReconnect } from "./reconnect.js";

const groupCache = new NodeCache({ stdTTL: 60 * 60 });

// Construído uma vez, no boot: nomes duplicados falham aqui, não em produção.
const router = buildRouter(commands);

const policy: AccessPolicy = {
  ownerJids: env.OWNER_JIDS,
  allowedGroups: env.ALLOWED_GROUPS,
};

let current: WASocket | null = null;
let attempt = 0;
let stopping = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function registerListeners(sock: WASocket): void {
  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("groups.update", (updates) => {
    for (const update of updates) {
      if (update.id) groupCache.set(update.id, update);
    }
  });

  sock.ev.on("group-participants.update", (update) => {
    if (update.id) groupCache.set(update.id, update);
  });

  sock.ev.on("messages.upsert", ({ messages }: { messages: WAMessage[] }) => {
    for (const message of messages) {
      if (message.key.remoteJid === "status@broadcast") continue;

      const parsed = parseMessage(message);
      if (!parsed) continue;

      logger.info({ from: parsed.senderJid, chat: parsed.chatJid }, parsed.text);

      void dispatch(router, sock, parsed, policy);
    }
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      logger.info("Escaneie o QR code abaixo para parear o dispositivo");
      console.log(await QRCode.toString(qr, { type: "terminal", small: true }));
    }

    if (connection === "open") {
      attempt = 0;
      logger.info("Conectado ao WhatsApp");
      return;
    }

    if (connection !== "close") return;
    if (stopping) return;

    const error = lastDisconnect?.error;
    const statusCode = error instanceof Boom ? error.output?.statusCode : undefined;
    const decision = decideReconnect(statusCode, attempt);

    if (decision.action === "stop") {
      logger.fatal({ statusCode }, decision.reason);
      process.exitCode = 1;
      return;
    }

    attempt += 1;
    logger.warn(
      { statusCode, attempt, delayMs: decision.delayMs },
      "Conexão caiu; reconectando",
    );

    await sleep(decision.delayMs);
    if (!stopping) await startBot();
  });
}

export async function startBot(): Promise<WASocket> {
  const sock = makeWASocket({
    logger,
    auth: state,
    browser: Browsers.macOS("Desktop"),
    shouldSyncHistoryMessage: () => false,
    cachedGroupMetadata: async (jid) => groupCache.get(jid),
  });

  current = sock;
  registerListeners(sock);
  return sock;
}

export async function stopBot(): Promise<void> {
  stopping = true;
  if (current) {
    current.end(undefined);
    current = null;
  }
}
```

Três detalhes que importam:

- `attempt` zera em `connection === "open"`, então uma queda depois de horas no ar recomeça o backoff em 1s, não no teto.
- `stopping` impede que o desligamento intencional da Task 9 dispare uma reconexão.
- O `console.log` do QR é a única exceção à regra de não usar `console`: o QR é arte ASCII para o terminal e o pino a destruiria.

- [ ] **Step 2: Verificar tipos**

Run: `npm run typecheck`
Expected: **ainda falha** em `src/services/handlers/msgHandler.ts` e `src/index.ts`, que a Task 9 remove. Nenhum erro deve apontar para `src/bootstrap/`, `src/core/`, `src/commands/` ou `src/config/`. Se apontar, corrija antes de seguir.

- [ ] **Step 3: Commit**

```bash
git add src/bootstrap/connection.ts
git commit -m "feat: startBot com reconexao automatica e listeners isolados"
```

---

### Task 9: Desligamento limpo e remoção do código antigo

**Files:**
- Create: `src/bootstrap/shutdown.ts`
- Modify: `src/index.ts` (substituição integral)
- Delete: `src/configs.ts`, `src/permissions.ts`, `src/services/handlers/`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `startBot` e `stopBot` (Task 8).
- Produces: `registerShutdownHandlers(): void`. Fecha o plano.

- [ ] **Step 1: Implementar `src/bootstrap/shutdown.ts`**

Hoje uma rejeição não tratada — por exemplo na chamada ao Gemini — pode derrubar o processo em silêncio.

```ts
import { logger } from "../services/logger/logger.js";
import { stopBot } from "./connection.js";

export function registerShutdownHandlers(): void {
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Desligando");
    try {
      await stopBot();
    } catch (error) {
      logger.error({ err: error }, "Erro ao encerrar o socket");
    }
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  process.on("unhandledRejection", (reason) => {
    logger.error({ err: reason }, "Promise rejeitada sem tratamento");
  });

  process.on("uncaughtException", (error) => {
    logger.fatal({ err: error }, "Exceção não capturada; encerrando");
    process.exit(1);
  });
}
```

- [ ] **Step 2: Substituir `src/index.ts` inteiro**

```ts
import { logger } from "./services/logger/logger.js";
import { registerShutdownHandlers } from "./bootstrap/shutdown.js";
import { startBot } from "./bootstrap/connection.js";
import "./services/db/db.js";

registerShutdownHandlers();

startBot().catch((error) => {
  logger.fatal({ err: error }, "Falha ao iniciar o bot");
  process.exit(1);
});
```

Some o `export const initWASocket = async (): Promise<void> => {}` — era código morto.

- [ ] **Step 3: Remover o código antigo**

```bash
git rm src/configs.ts src/permissions.ts
git rm -r src/services/handlers
```

- [ ] **Step 4: Tirar `configs.ts` do `.gitignore`**

Remova a linha `configs.ts`. O arquivo não existe mais, e mantê-la faria um futuro `src/config/…` ser ignorado por acidente. Confirme que `.env`, `auth`, `node_modules/`, `dist/`, `bot.db` e `data/` continuam listados.

- [ ] **Step 5: Verificar tipos e testes — agora tudo deve passar**

```bash
npm run typecheck && npm test && npm run build
```
Expected: sem erro de tipo, todos os testes verdes, `dist/` gerado.

- [ ] **Step 6: Confirmar que não sobrou `@ts-ignore` nem `console` indevido**

```bash
grep -rn "@ts-ignore" src/ || echo "OK: nenhum @ts-ignore"
grep -rn "console\.\(log\|error\|warn\)" src/ || echo "OK: nenhum console"
```
Expected: o único resultado aceitável é o `console.log` do QR code em `src/bootstrap/connection.ts`. Qualquer outro deve virar `logger`.

- [ ] **Step 7: Teste manual de fumaça**

Este é o teste que importa — nenhum teste automatizado cobre o socket real.

```bash
npm run dev
```

Verifique, nesta ordem:
1. O bot conecta e loga "Conectado ao WhatsApp".
2. Mandar `oi` de um número em `OWNER_JIDS` recebe resposta.
3. Mandar `oi` de um número **fora** de `OWNER_JIDS`, num grupo autorizado, **não** recebe resposta, e o log mostra "Comando bloqueado". É a correção do problema 3.
4. `!ifood lista` mostra os 6 lançamentos existentes.
5. `!ifood remove 999` responde **apenas** "Nenhum lançamento encontrado com esse ID" — uma mensagem, não duas. É a correção do bug.
6. `!ifood add teste - loja - 10,50 - credito` registra com valor `10.50`. É a prova de que a vírgula sobrevive ao parser.
7. `eustáquio oi` responde. `Eustáquio oi`, com maiúscula, também.
8. **A prova principal:** desligue o Wi-Fi por ~30 segundos e religue. O log deve mostrar "Conexão caiu; reconectando" com `delayMs` crescente, e o bot deve voltar sozinho, sem reinício manual. É a correção do problema 1.
9. `Ctrl+C` desliga limpo, com o log "Desligando", sem tentar reconectar.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: desligamento limpo e remocao dos handlers antigos"
```

---

## Verificação final das Fases 1 e 2

Contra os três problemas do spec:

| Problema | Onde foi resolvido | Como verificar |
|---|---|---|
| 1. Não reconecta | Tasks 7 e 8 | Task 9, Step 7, item 8 |
| 2. Clone novo não compila | Task 2 (`.env.example`), Task 9 (remoção de `configs.ts`) | `npm run build` após clone limpo |
| 3. Permissão tudo-ou-nada em grupo | Task 4 | Task 9, Step 7, item 3 |

Itens menores do spec também cobertos: bug do `remove` (Task 6), normalização inconsistente (Task 3), `@ts-ignore` (Task 9, Step 6), `console.*` (Task 9, Step 6), script `gemini` quebrado (Task 1), `initWASocket` morto (Task 9), `bot.db` fora do repositório e migrado para `data/` sem perder os 6 lançamentos (Tasks 1 e 2).

**Segue fora de escopo, conforme o spec:** hardening do Gemini (timeout, retry, rate limit, cota por usuário). A Task 6 faz apenas a separação da `systemInstruction`, que sai de graça na migração.

**Pré-requisitos da Fase 3 entregues aqui:** socket via factory (Task 8) e `senderJid` normalizado no parser (Task 3) — vira a coluna `owner_jid`.
