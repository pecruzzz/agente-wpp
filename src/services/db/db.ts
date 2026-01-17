import Database from "better-sqlite3";
import { Database as DBType } from "better-sqlite3";
import { logger } from "../logger/logger.js";
import { DB_PATH } from "../../configs.js";

let db: DBType;

try {
  db = new Database(DB_PATH);
  logger.info("Banco de dados iniciado com sucesso");
} catch (error: unknown) {
  logger.error("Erro ao abrir o banco");
  throw error;
}

db.exec(
  `
  CREATE TABLE IF NOT EXISTS ifood (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    texto TEXT
  )
`,
);

export default db;
