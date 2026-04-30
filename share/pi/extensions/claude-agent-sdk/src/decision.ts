import type {
  Context,
  Model,
  SimpleStreamOptions,
  Tool,
} from "@mariozechner/pi-ai";
import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

import {
  buildColdSeedMessages,
  messageContentToText,
  toolResultToSdk,
  userMessageToSdk,
} from "./pi-to-sdk.js";
import { findDivergenceIndex } from "./state-diff.js";
import type { StaticPrefix } from "./types.js";

export type ToolResultEntry = {
  toolCallId: string;
  text: string;
  isError: boolean;
};

/**
 * What to do for a single streamSimple call, computed by diffing pi's
 * current message branch against what we last sent the SDK.
 */
export type TurnDecision =
  | { kind: "cold-seed" }
  | { kind: "fork"; forkAtPiIdx: number; forkAtUuid: string }
  | {
      kind: "resolve-tool";
      toolResults: ToolResultEntry[];
      followUpUserMessages: SDKUserMessage[];
    }
  | { kind: "linear-extension"; userMessages: SDKUserMessage[] };

/**
 * Compute the decision for the current call based on (a) whether a runtime
 * already exists, (b) how the new pi message branch diverges from what was
 * sent last time, and (c) what kind of message(s) appeared in the tail.
 */
export function decideTurnAction(
  runtime:
    | { lastSignatures: string[]; sdkUuidByPiIndex: Map<number, string> }
    | undefined,
  newSigs: string[],
  messages: any[],
): TurnDecision {
  if (!runtime) return { kind: "cold-seed" };

  const oldSigs = runtime.lastSignatures;
  const divergence = findDivergenceIndex(oldSigs, newSigs);
  const isPureExtension =
    divergence === oldSigs.length && newSigs.length >= oldSigs.length;
  const tail = isPureExtension ? messages.slice(oldSigs.length) : [];

  if (isPureExtension && tail.length === 0) {
    // Pi called us with no new entry. Shouldn't happen in a well-behaved
    // loop; cold-seed to be safe.
    return { kind: "cold-seed" };
  }

  if (isPureExtension) {
    const toolResults: ToolResultEntry[] = [];
    const userMessages: SDKUserMessage[] = [];
    for (const m of tail) {
      if (m?.role === "toolResult") {
        toolResults.push({
          toolCallId: m.toolCallId,
          text: messageContentToText(m.content),
          isError: m.isError === true,
        });
      } else if (m?.role === "user") {
        const sdkMsg = userMessageToSdk(m);
        if (sdkMsg) userMessages.push(sdkMsg);
      }
      // assistant entries in the tail mean pi appended one of our own
      // outputs back into context; ignore.
    }
    if (toolResults.length > 0) {
      // Tool results may be followed by a fresh user message. Resolve
      // the tool deferreds first; user messages get queued so they
      // land once the SDK has caught up past the tool resolution.
      return {
        kind: "resolve-tool",
        toolResults,
        followUpUserMessages: userMessages,
      };
    }
    if (userMessages.length > 0) {
      return { kind: "linear-extension", userMessages };
    }
    return { kind: "cold-seed" };
  }

  // Divergence — find the deepest assistant turn in the common prefix.
  let forkAtPiIdx = -1;
  for (let i = divergence - 1; i >= 0; i--) {
    if (messages[i]?.role === "assistant") {
      forkAtPiIdx = i;
      break;
    }
  }
  if (forkAtPiIdx < 0) return { kind: "cold-seed" };
  const forkAtUuid = runtime.sdkUuidByPiIndex.get(forkAtPiIdx);
  if (!forkAtUuid) return { kind: "cold-seed" };
  return { kind: "fork", forkAtPiIdx, forkAtUuid };
}

/**
 * Build the tail messages to seed onto a forked SDK session: every pi
 * message past the fork point, replayed as user/tool_result.
 */
export function buildForkTail(
  messages: any[],
  forkAtPiIdx: number,
): SDKUserMessage[] {
  const tail: SDKUserMessage[] = [];
  for (let i = forkAtPiIdx + 1; i < messages.length; i++) {
    const m = messages[i];
    if (!m) continue;
    if (m.role === "user") {
      const sdkMsg = userMessageToSdk(m);
      if (sdkMsg) tail.push(sdkMsg);
    } else if (m.role === "toolResult") {
      tail.push(toolResultToSdk(m));
    }
  }
  for (let i = 0; i < tail.length - 1; i++) {
    (tail[i] as any).shouldQuery = false;
  }
  return tail;
}

/** Inputs to applyDecision; collects the dependencies the runtime owns. */
export type ApplyDecisionArgs = {
  decision: TurnDecision;
  sessionKey: string;
  model: Model<any>;
  context: Context;
  staticPrefix: StaticPrefix;
  options: SimpleStreamOptions | undefined;
  tools: Tool[];
};

// applyDecision lives in runtime.ts because it needs access to runtime
// internals (createRuntime, shutdownRuntime, the active runtimes map). It
// uses the decision shapes and helpers from this file.
export { buildColdSeedMessages };
