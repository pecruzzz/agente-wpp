import makeWASocket, {
  Browsers,
  useMultiFileAuthState,
  DisconnectReason,
  WAMessage,
  fetchLatestWaWebVersion,
} from "baileys";
import { logger } from "./services/logger/logger.js";
import { state, saveCreds } from "./auth.js";

import NodeCache from "node-cache";

const sock = makeWASocket({ logger, auth: state });

import "./services/db/db.js";

const CONNECTION_TYPE = "QR";
const USE_LASTEST_VERSION = true;

export const initWASocket = async (): Promise<void> => {};
