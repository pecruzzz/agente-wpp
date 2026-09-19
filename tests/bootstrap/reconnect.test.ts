import { describe, it, expect } from "vitest";
import { DisconnectReason } from "baileys";
import { decideReconnect, BACKOFF_BASE_MS, BACKOFF_MAX_MS } from "../../src/bootstrap/reconnect.js";

describe("decideReconnect", () => {
  it("para de vez em loggedOut", () => {
    const d = decideReconnect(DisconnectReason.loggedOut, 0);
    expect(d.action).toBe("stop");
    if (d.action === "stop") expect(d.reason).toMatch(/QR/i);
  });

  it("para de vez em badSession", () => {
    expect(decideReconnect(DisconnectReason.badSession, 0).action).toBe("stop");
  });

  it("reconecta imediatamente em restartRequired", () => {
    const d = decideReconnect(DisconnectReason.restartRequired, 0);
    expect(d).toEqual({ action: "reconnect", delayMs: 0 });
  });

  it("reconecta imediatamente em restartRequired enquanto attempt < 3 (handshake de pareamento)", () => {
    expect(decideReconnect(DisconnectReason.restartRequired, 1)).toEqual({
      action: "reconnect", delayMs: 0,
    });
    expect(decideReconnect(DisconnectReason.restartRequired, 2)).toEqual({
      action: "reconnect", delayMs: 0,
    });
  });

  it("a partir de attempt 3, restartRequired cai no backoff normal em vez de loop sem delay", () => {
    // Corrige o loop de criação de socket sem nenhum delay quando
    // restartRequired vem repetido de um auth/ corrompido, em vez do
    // handshake normal de pareamento.
    const d = decideReconnect(DisconnectReason.restartRequired, 3);
    expect(d.action).toBe("reconnect");
    if (d.action === "reconnect") {
      expect(d.delayMs).toBeGreaterThan(0);
    }

    const d9 = decideReconnect(DisconnectReason.restartRequired, 9);
    expect(d9.action).toBe("reconnect");
    if (d9.action === "reconnect") {
      expect(d9.delayMs).toBeGreaterThan(0);
      expect(d9.delayMs).toBeLessThanOrEqual(BACKOFF_MAX_MS);
    }
  });

  it("para de vez em connectionReplaced (440), com razão própria e sem reusar o texto de loggedOut", () => {
    const d = decideReconnect(DisconnectReason.connectionReplaced, 0);
    expect(d.action).toBe("stop");
    if (d.action === "stop") {
      expect(d.reason).toMatch(/outro (cliente|dispositivo)/i);
      expect(d.reason).not.toMatch(/QR/i);
    }
  });

  it("para de vez em forbidden (403), com razão própria de conta bloqueada", () => {
    const d = decideReconnect(DisconnectReason.forbidden, 0);
    expect(d.action).toBe("stop");
    if (d.action === "stop") {
      expect(d.reason).toMatch(/bloque|banid/i);
      expect(d.reason).not.toMatch(/QR/i);
    }
  });

  it("para de vez em multideviceMismatch (411), com razão própria", () => {
    const d = decideReconnect(DisconnectReason.multideviceMismatch, 0);
    expect(d.action).toBe("stop");
    if (d.action === "stop") {
      expect(d.reason).toMatch(/multi.?device|multidispositivo/i);
      expect(d.reason).not.toMatch(/QR/i);
    }
  });

  it("aplica backoff exponencial em connectionLost", () => {
    const d0 = decideReconnect(DisconnectReason.connectionLost, 0);
    const d1 = decideReconnect(DisconnectReason.connectionLost, 1);
    const d2 = decideReconnect(DisconnectReason.connectionLost, 2);
    expect(d0.action).toBe("reconnect");
    if (d0.action === "reconnect" && d1.action === "reconnect" && d2.action === "reconnect") {
      expect(d0.delayMs).toBeGreaterThanOrEqual(BACKOFF_BASE_MS);
      expect(d0.delayMs).toBeLessThan(BACKOFF_BASE_MS * 2);
      expect(d1.delayMs).toBeGreaterThanOrEqual(BACKOFF_BASE_MS * 2);
      expect(d1.delayMs).toBeLessThan(BACKOFF_BASE_MS * 4);
      expect(d2.delayMs).toBeGreaterThanOrEqual(BACKOFF_BASE_MS * 4);
      expect(d2.delayMs).toBeLessThan(BACKOFF_BASE_MS * 8);
    }
  });

  it("limita o backoff ao teto", () => {
    for (const attempt of [10, 20, 50]) {
      const d = decideReconnect(DisconnectReason.connectionClosed, attempt);
      expect(d.action).toBe("reconnect");
      if (d.action === "reconnect") {
        expect(d.delayMs).toBeLessThanOrEqual(BACKOFF_MAX_MS);
        expect(d.delayMs).toBeGreaterThan(0);
      }
    }
  });

  it("reconecta com backoff quando o statusCode é desconhecido", () => {
    expect(decideReconnect(undefined, 0).action).toBe("reconnect");
  });
});
