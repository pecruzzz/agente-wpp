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
