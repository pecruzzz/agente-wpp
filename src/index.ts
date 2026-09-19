import { logger } from "./services/logger/logger.js";
import { registerShutdownHandlers } from "./bootstrap/shutdown.js";
import { startBot } from "./bootstrap/connection.js";
import "./services/db/db.js";

registerShutdownHandlers();

startBot().catch((error) => {
  logger.fatal({ err: error }, "Falha ao iniciar o bot");
  process.exit(1);
});
