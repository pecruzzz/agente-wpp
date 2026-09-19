import makeWASocket, {
  Browsers,
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

// Cobre a janela entre "decidimos reconectar" e "o novo socket já está de
// pé": true logo antes do sleep, false logo depois que startBot() retorna.
// Sem isso, um segundo evento "close" do MESMO socket velho, disparado
// durante o sleep, passaria pela checagem de identidade abaixo (current
// ainda aponta pro socket velho nesse instante) e agendaria um segundo
// startBot() em paralelo.
let reconnecting = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Dedup de mensagens por key.id entre reconexões. Na reconexão, o WhatsApp
// reentrega mensagens que ficaram enfileiradas enquanto o socket esteve
// fora — sem isso, comandos não-idempotentes (ex.: `!ifood add`) rodam de
// novo a cada oscilação de rede. Limite de 200 IDs: memória limitada, e o
// bot é pessoal (baixo volume), então nenhuma janela realista de
// reconexão entrega mais que isso.
const SEEN_MESSAGE_IDS_LIMIT = 200;
const seenMessageIds = new Set<string>();

function alreadySeen(id: string | null | undefined): boolean {
  if (!id) return false;
  if (seenMessageIds.has(id)) return true;

  seenMessageIds.add(id);
  if (seenMessageIds.size > SEEN_MESSAGE_IDS_LIMIT) {
    const oldest = seenMessageIds.values().next().value;
    if (oldest !== undefined) seenMessageIds.delete(oldest);
  }
  return false;
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

  sock.ev.on("messages.upsert", ({ messages, type }: { messages: WAMessage[]; type: string }) => {
    // Mesma lógica do guard em connection.update: se o buffer de eventos
    // deste socket (já trocado) der flush depois que `startBot()` promoveu
    // outro socket a `current`, essas mensagens não podem ser despachadas
    // de novo por aqui — o socket novo já está cuidando delas.
    if (current !== sock) return;

    // Lotes "append" são histórico/sync, não mensagens novas — só "notify"
    // representa mensagens chegando agora.
    if (type !== "notify") return;

    for (const message of messages) {
      if (message.key.remoteJid === "status@broadcast") continue;
      if (alreadySeen(message.key.id)) continue;

      const parsed = parseMessage(message);
      if (!parsed) continue;

      logger.info({ from: parsed.senderJid, chat: parsed.chatJid }, parsed.text);

      void dispatch(router, sock, parsed, policy);
    }
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (connection === "open") {
      attempt = 0;
      logger.info("Conectado ao WhatsApp");
      return;
    }

    // Todo o ramo de fechamento roda ANTES de qualquer `await` (o `await
    // QRCode.toString(...)` do QR fica fora deste bloco, mais abaixo). Se o
    // QR viesse primeiro, um update que trouxesse `qr` e
    // `connection: "close"` juntos cederia o event loop antes das guardas
    // de reentrância abaixo, reabrindo a janela de socket duplicado que
    // elas existem para fechar.
    if (connection === "close") {
      // Desligamento intencional (Task 9): nunca reconectar.
      if (stopping) return;

      // Este listener foi registrado sobre `sock`, que é o socket em que ele
      // vive. Se `current` já aponta para outro socket, este é um evento
      // tardio de um socket que já foi substituído (ex.: "close" duplicado
      // emitido antes da troca) — ignorar.
      if (current !== sock) return;

      // Já existe uma reconexão em andamento (dormindo ou criando o socket
      // novo) disparada por um "close" anterior deste mesmo socket. Um
      // segundo "close" do mesmo socket, durante essa janela, não deve
      // disparar outro startBot() em paralelo.
      if (reconnecting) return;

      const error = lastDisconnect?.error;
      const statusCode = error instanceof Boom ? error.output?.statusCode : undefined;
      const decision = decideReconnect(statusCode, attempt);

      if (decision.action === "stop") {
        logger.fatal({ statusCode }, decision.reason);

        // Trava definitivamente: sem isso, um "close" posterior no MESMO
        // socket com outro statusCode (ex.: undefined) passaria pelas
        // guardas acima de novo e entraria em loop de reconexão com uma
        // credencial que já sabemos inválida.
        stopping = true;
        current?.end(undefined);

        // process.exitCode sozinho deixa o processo vivo, sem conexão e
        // sem reconectar — "zumbi": um supervisor (systemd, pm2) nunca vê
        // o processo cair, então nunca reinicia, e ninguém recebe o pedido
        // de novo QR que a mensagem de erro manda providenciar.
        process.exit(1);
        return;
      }

      attempt += 1;
      reconnecting = true;
      logger.warn(
        { statusCode, attempt, delayMs: decision.delayMs },
        "Conexão caiu; reconectando",
      );

      await sleep(decision.delayMs);
      try {
        if (!stopping) await startBot();
      } catch (err) {
        // startBot() falhou ao recriar o socket: não sobra nenhum socket
        // vivo, `current` ainda aponta pro morto, e nenhum "close" futuro
        // virá para tentar de novo — o bot ficaria mudo para sempre. Sem
        // este catch, a rejeição também escaparia deste listener `async`
        // sem ninguém dar `await` nele (unhandled rejection).
        logger.fatal({ err }, "Falha ao recriar o socket após reconexão; encerrando");
        process.exit(1);
      } finally {
        reconnecting = false;
      }
      return;
    }

    // Chegou aqui: connection não é nem "open" nem "close" (tipicamente
    // "connecting", durante o pareamento inicial). É o único lugar do
    // handler onde ainda podemos ceder o event loop com segurança — nenhum
    // caminho que leve a `reconnecting = true` passa por este `await`.
    if (qr) {
      logger.info("Escaneie o QR code abaixo para parear o dispositivo");
      console.log(await QRCode.toString(qr, { type: "terminal", small: true }));
    }
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
