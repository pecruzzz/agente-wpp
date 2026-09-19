import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { Database as DBType } from "better-sqlite3";
import { logger } from "../logger/logger.js";
import { env } from "../../config/env.js";

let db: DBType;

try {
  // DB_PATH tem default "./data/bot.db" e "data/" nunca é criado por nada
  // além disso — um clone novo do repositório falha aqui sem isto.
  fs.mkdirSync(path.dirname(env.DB_PATH), { recursive: true });
  db = new Database(env.DB_PATH);
  logger.info("Banco de dados iniciado com sucesso");
} catch (error: unknown) {
  logger.error({ err: error }, "Erro ao abrir o banco");
  throw error;
}

db.exec(
  `
  CREATE TABLE IF NOT EXISTS ifood (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item TEXT NOT NULL,
  loja TEXT NOT NULL,
  valor REAL NOT NULL,
  pagamento TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`,
);

export default db;
