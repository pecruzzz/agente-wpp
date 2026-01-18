import { Command } from "./types.js";
import db from "../db/db.js";
import { logger } from "../logger/logger.js";

function formatDate(value?: string) {
  if (!value) return "—";

  const iso = value.replace(" ", "T") + "Z";

  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ifoodCommands: Command = {
  command: "!ifood",
  execute: async (bot, message) => {
    const text = message.content?.toLowerCase();
    if (!text) return;

    const parts = text.trim().split(/\s+/);
    const action = parts[1];

    // Se não tiver ação, sai
    if (!action) return;

    // =========================
    // ADD
    // =========================
    if (action === "add") {
      const rest = text.trim().split(" ").slice(2).join(" ");
      const itens = rest.split("-").map((p) => p.trim());

      if (itens.length !== 4) {
        await bot.sendMessage(message.key.remoteJid!, {
          text:
            "❌ Formato inválido\n" +
            "Use:\n!ifood add item - loja - valor - credito/debito",
        });
        return;
      }

      const [item, loja, valorStr, pagamento] = itens;
      const valor = Number(valorStr.replace(",", "."));

      if (isNaN(valor)) {
        await bot.sendMessage(message.key.remoteJid!, {
          text: "❌ Valor inválido",
        });
        return;
      }

      if (!["credito", "debito"].includes(pagamento)) {
        await bot.sendMessage(message.key.remoteJid!, {
          text: "❌ Pagamento deve ser credito ou debito",
        });
        return;
      }

      try {
        let stmt = db.prepare(
          `INSERT INTO ifood (item, loja, valor, pagamento) VALUES (?, ?, ?, ?)`,
        );
        const result = stmt.run(item, loja, valor, pagamento);

        logger.info("Lançamento em ifood");

        bot.sendMessage(message.key.remoteJid!, {
          text:
            `✅ Lançamento registrado\n` +
            //@ts-ignore
            `🆔 ID: ${result.lastInsertRowid}\n` +
            `🍔 Item: ${item}\n` +
            `🏪 Loja: ${loja}\n` +
            `💰 Valor: R$ ${valor.toFixed(2)}\n` +
            `💳 Pagamento: ${pagamento}`,
        });
      } catch (error) {
        logger.error(error);
        await bot.sendMessage(message.key.remoteJid!, {
          text: "Erro ao realizar lançamento!",
        });
        return;
      }
    }

    // =========================
    // REMOVE
    // =========================
    if (action === "remove") {
      const idStr = parts[2];
      const id = Number(idStr);

      if (isNaN(id)) {
        await bot.sendMessage(message.key.remoteJid!, {
          text: "❌ ID inválido",
        });
        return;
      }

      try {
        const stmt = db.prepare(`DELETE FROM ifood WHERE id =?`);
        const result = stmt.run(id);
        await bot.sendMessage(message.key.remoteJid!, {
          text: `🗑️ Lançamento ${id} removido com sucesso`,
        });

        if (result.changes === 0) {
          await bot.sendMessage(message.key.remoteJid!, {
            text: "❌ Nenhum lançamento encontrado com esse ID",
          });
          return;
        }
      } catch (err) {
        await bot.sendMessage(message.key.remoteJid!, {
          text: "Erro ao remover lançamento",
        });
        logger.error("Erro ao remover lançamento");
      }

      return;
    }

    // =========================
    // LISTA
    // =========================
    if (action === "lista") {
      try {
        const stmt = db.prepare(`SELECT * FROM ifood`);
        const rows = stmt.all();

        if (!rows.length) {
          bot.sendMessage(message.key.remoteJid!, {
            text: "Lista vazia!",
          });
          return;
        }
        bot.sendMessage(message.key.remoteJid!, {
          text:
            "🛒 iFood:\n\n" +
            "ID | Item | Loja | Valor | Pagamento | Criado em\n" +
            rows
              .map((r: any) => {
                return `${r.id} | ${r.item} | ${r.loja} | R$ ${Number(r.valor)
                  .toFixed(2)
                  .replace(
                    ".",
                    ",",
                  )} | ${r.pagamento} | ${formatDate(r.created_at)}`;
              })
              .join("\n"),
        });
      } catch (error) {
        bot.sendMessage(message.key.remoteJid!, {
          text: "Não foi possível carregar a lista",
        });
        logger.error("Não foi possível carregar a lista: " + error);
      }
    }

    return;
  },
};

export default ifoodCommands;
