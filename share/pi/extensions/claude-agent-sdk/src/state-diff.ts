import { shortHash } from "./util.js";

/**
 * Stable signature for a pi message. Two messages with the same signature
 * are interchangeable as far as cache-prefix replay is concerned.
 *
 * - toolResult: keyed by toolCallId (already content-stable) plus a hash of
 *   the result body as defense-in-depth.
 * - user/assistant: timestamp + content hash. Timestamp alone isn't enough
 *   for sub-millisecond regenerations; the content hash catches those.
 */
export function piMessageSignature(message: any): string {
  if (!message || typeof message !== "object") return "?";
  if (message.role === "toolResult") {
    const contentHash = shortHash(JSON.stringify(message.content ?? ""));
    return `t:${message.toolCallId ?? "?"}:${contentHash}`;
  }
  if (message.role === "user") {
    return `u:${message.timestamp ?? "?"}:${shortHash(JSON.stringify(message.content ?? ""))}`;
  }
  if (message.role === "assistant") {
    return `a:${message.timestamp ?? "?"}:${shortHash(JSON.stringify(message.content ?? ""))}`;
  }
  return "?";
}

export function computeSignatures(messages: any[]): string[] {
  return messages.map(piMessageSignature);
}

/**
 * Index in `newSigs` where divergence from `oldSigs` begins. If neither
 * diverges (one is a prefix of the other), returns the shorter length.
 *
 * Callers detect a clean linear extension as `divergence === oldSigs.length`
 * and a truncation/rewind as `divergence < oldSigs.length`.
 */
export function findDivergenceIndex(
  oldSigs: string[],
  newSigs: string[],
): number {
  const limit = Math.min(oldSigs.length, newSigs.length);
  for (let i = 0; i < limit; i++) {
    if (oldSigs[i] !== newSigs[i]) return i;
  }
  return Math.min(oldSigs.length, newSigs.length);
}

/**
 * Walk SDK persisted messages and align them to pi message indexes by
 * order-of-appearance. Used for fork-point lookup: pi's branch is in terms
 * of pi message indexes, but `forkSession` wants an SDK message UUID.
 *
 * SDK system messages (init etc.) are skipped. Pi's user/toolResult both
 * map to SDK "user" messages; pi's assistant maps to SDK "assistant".
 */
export function buildPiIndexToSdkUuid(
  piMessages: any[],
  sdkMessages: Array<{ type: string; uuid: string; message: any }>,
): Map<number, string> {
  const map = new Map<number, string>();
  let sdkIdx = 0;
  for (let piIdx = 0; piIdx < piMessages.length; piIdx++) {
    const piRole = piMessages[piIdx]?.role;
    const wantSdkType =
      piRole === "assistant"
        ? "assistant"
        : piRole === "user" || piRole === "toolResult"
          ? "user"
          : null;
    if (!wantSdkType) continue;
    while (
      sdkIdx < sdkMessages.length &&
      sdkMessages[sdkIdx]!.type !== wantSdkType
    )
      sdkIdx++;
    if (sdkIdx >= sdkMessages.length) break;
    map.set(piIdx, sdkMessages[sdkIdx]!.uuid);
    sdkIdx++;
  }
  return map;
}
