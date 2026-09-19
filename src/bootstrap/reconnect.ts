import { DisconnectReason } from "baileys";

export const BACKOFF_BASE_MS = 1000;
export const BACKOFF_MAX_MS = 60000;

export type ReconnectDecision =
  | { action: "reconnect"; delayMs: number }
  | { action: "stop"; reason: string };

/**
 * Decide se e quando reconectar, a partir do statusCode do Boom em
 * lastDisconnect.error. Pura: não dorme, não conecta, não loga.
 *
 * @param attempt 0 na primeira falha após uma conexão bem-sucedida.
 */
export function decideReconnect(
  statusCode: number | undefined,
  attempt: number,
): ReconnectDecision {
  if (statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.badSession) {
    return {
      action: "stop",
      reason:
        "Sessão inválida: o WhatsApp desconectou este dispositivo. " +
        "Apague o diretório auth/ e escaneie o QR novamente.",
    };
  }

  // Outro cliente assumiu esta sessão. Reconectar aqui reabre a sessão e
  // derruba o outro cliente; se ele também reconectar, os dois entram em
  // ping-pong contra a conta real, sem o backoff escalar (attempt zera a
  // cada "open") — vetor clássico de ban. Fica parado até intervenção manual.
  if (statusCode === DisconnectReason.connectionReplaced) {
    return {
      action: "stop",
      reason:
        "Outro cliente assumiu esta sessão do WhatsApp. " +
        "Encerre a sessão no outro dispositivo (ou aqui) antes de reconectar.",
    };
  }

  // Conta bloqueada/banida pelo WhatsApp. Tentar de novo a cada minuto não
  // resolve nada e só gera ruído.
  if (statusCode === DisconnectReason.forbidden) {
    return {
      action: "stop",
      reason: "Conta bloqueada pelo WhatsApp (403). Verifique o estado da conta antes de reconectar.",
    };
  }

  // Incompatibilidade de versão multi-device entre este cliente e o servidor.
  // Reconectar não resolve; precisa atualizar a lib/protocolo.
  if (statusCode === DisconnectReason.multideviceMismatch) {
    return {
      action: "stop",
      reason:
        "Incompatibilidade multi-device (411) com o servidor do WhatsApp. " +
        "Atualize a biblioteca Baileys antes de reconectar.",
    };
  }

  // Parte normal do pareamento: o WhatsApp pede restart e espera reconexão
  // já. Só nas primeiras tentativas — um restartRequired repetido (ex.:
  // auth/ corrompido) não pode virar um loop de criação de socket sem
  // nenhum delay; a partir daqui cai no backoff normal abaixo.
  if (statusCode === DisconnectReason.restartRequired && attempt < 3) {
    return { action: "reconnect", delayMs: 0 };
  }

  const exponential = Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_MAX_MS);
  // Jitter de até 100% do passo, para não sincronizar tentativas.
  const jitter = Math.random() * exponential;
  const delayMs = Math.min(Math.floor(exponential + jitter), BACKOFF_MAX_MS);

  return { action: "reconnect", delayMs };
}
