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
