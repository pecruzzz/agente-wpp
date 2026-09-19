import { describe, it, expect } from "vitest";
import { formatRemoveResult } from "../../src/commands/ifood.js";

describe("formatRemoveResult", () => {
  it("confirma quando removeu", () => {
    expect(formatRemoveResult(7, 1)).toContain("7");
    expect(formatRemoveResult(7, 1)).toContain("removido");
  });

  it("NÃO confirma remoção quando nada foi removido", () => {
    const msg = formatRemoveResult(999, 0);
    expect(msg).not.toContain("removido com sucesso");
    expect(msg).toMatch(/nenhum lançamento/i);
  });
});
