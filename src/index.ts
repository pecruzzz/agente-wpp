import makeWASocket, {
  Browsers,
  useMultiFileAuthState,
  DisconnectReason,
  WAMessage,
  fetchLatestWaWebVersion,
} from "baileys";
import { logger } from "./services/logger/logger.js";
import { state, saveCreds } from "./auth.js";
import "./services/db/db.js";
import QRCode from "qrcode";
import NodeCache from "node-cache";
import Boom, { isBoom } from "@hapi/boom";
import { getMessage } from "./services/handlers/msgParser.js";
import MessageHandler from "./services/handlers/msgHandler.js";
const USE_LASTEST_VERSION = true;

const groupCache = new NodeCache({
  stdTTL: 60 * 60,
});

const sock = makeWASocket({
  shouldSyncHistoryMessage: () => false,
  logger,
  auth: state,
  browser: Browsers.macOS("Desktop"),
  cachedGroupMetadata: async (jid) => groupCache.get(jid),
});

sock.ev.on("groups.update", (updates) => {
  updates.forEach((u) => {
    if (u.id) groupCache.set(u.id, u);
  });
});

sock.ev.on("group-participants.update", (updates) => {
  if (Array.isArray(updates)) {
    updates.forEach((u) => {
      if (u.id) groupCache.set(u.id, u);
    });
  } else if (updates.id) {
    groupCache.set(updates.id, updates);
  }
});
sock.ev.on("creds.update", saveCreds);

sock.ev.on("connection.update", async (update) => {
  const { connection, lastDisconnect, qr } = update;

  if (connection === "close") {
    const error = lastDisconnect?.error;

    if (error && Boom.isBoom(error)) {
      if (error.output.statusCode === DisconnectReason.restartRequired) {
        console.warn("Restart requerido pelo WhatsApp");
      }
    }
  }

  // In prod, send this string to your frontend then generate the QR there
  if (qr) {
    console.log(await QRCode.toString(qr, { type: "terminal" }));
  }
});

sock.ev.on("messages.upsert", ({ messages }: { messages: WAMessage[] }) => {
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];

    const isStatus = message.key.remoteJid === "status@broadcast";

    if (isStatus) continue;

    // @ts-ignore
    const formattedMessage: FormattedMessage | undefined = getMessage(message);
    logger.info(
      message.key.remoteJid?.split("@")[0] +
        ": " +
        getMessage(message)?.content,
    );

    if (formattedMessage !== undefined) {
      MessageHandler(sock, formattedMessage);
    }
  }
});

export const initWASocket = async (): Promise<void> => {};
