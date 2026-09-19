import { logger } from "../services/logger/logger.js";
import { stopBot } from "./connection.js";
import db from "../services/db/db.js";

export function registerShutdownHandlers(): void {
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Desligando");
    try {
      await stopBot();
    } catch (error) {
      logger.error({ err: error }, "Erro ao encerrar o socket");
    }
    try {
      db.close();
    } catch (error) {
      logger.error({ err: error }, "Erro ao fechar o banco");
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
