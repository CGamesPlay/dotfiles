import {
  calculateCost,
  type AssistantMessage,
  type Model,
} from "@earendil-works/pi-ai";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

import { mapStopReason } from "./pi-to-sdk.js";
import type { ActiveTurn } from "./types.js";

/**
 * The slice of SessionRuntime that the SDK→pi stream translator needs.
 * Decoupling the translator from the full SessionRuntime keeps it
 * unit-testable: a hand-rolled object satisfying this interface plus a
 * fake stream is enough to drive the translator end-to-end.
 */
export type TranslatorContext = {
  model: Model<any>;
  activeTurn: ActiveTurn | undefined;
  /** SDK content_block index → pi content array index. Mutated as blocks open. */
  turnBlockMap: Map<number, number>;
  /** Capture sdkSessionId from system.init / message.session_id. */
  sdkSessionId: string | undefined;
  createdSdkSessionIds: Set<string>;
  /**
   * Called when a result message or terminal event finalizes the turn.
   * The runtime cleans up activeTurn and resolves the per-turn done
   * deferred. Tool-use surfacing is NOT routed through here — it goes
   * via the MCP handler path in the runtime.
   */
  finalizeTurn(
    reason: "stop" | "length" | "toolUse" | "error" | "aborted",
  ): void;
};

/**
 * Top-level dispatcher for messages yielded by the SDK iterator. Captures
 * sdkSessionId opportunistically and routes by type.
 */
export function handleSdkMessage(
  ctx: TranslatorContext,
  message: SDKMessage,
): void {
  const anyMsg = message as any;
  if (typeof anyMsg.session_id === "string" && !ctx.sdkSessionId) {
    ctx.sdkSessionId = anyMsg.session_id;
    ctx.createdSdkSessionIds.add(anyMsg.session_id);
  }

  switch (message.type) {
    case "stream_event":
      handleStreamEvent(ctx, (message as SDKMessage & { event: any }).event);
      return;
    case "result": {
      const turn = ctx.activeTurn;
      if (!turn || turn.finalized) return;
      // The CLI emits intermediate `result` events for internal
      // sub-tasks (notably session-title generation on cold-start) that
      // complete with num_turns=0 before the real user query even
      // begins. Finalizing on those would ship an empty assistant
      // before the real response streams in. Skip them — the real
      // result that closes the user query will have num_turns>=1.
      const numTurns = (message as any).num_turns;
      if (typeof numTurns === "number" && numTurns === 0) return;
      // Intentionally ignore the result message's `usage` field. It
      // aggregates across every API call made by the current `query()`
      // since it started — which spans multiple pi-side turns when a
      // tool_use parks an SDK turn mid-flight (turn 1 emits tool_use,
      // turn 2 resolves the parked tool_result, both flow through one
      // SDK turn). Applying it here clobbers the per-API-call usage
      // already accumulated from message_start/message_delta with a
      // cumulative-from-query-start total, which makes turn 2 falsely
      // appear to have rewritten the entire prefix again.
      const stopReason = mapStopReason((message as any).stop_reason);
      turn.output.stopReason = stopReason;
      ctx.finalizeTurn(stopReason);
      return;
    }
    default:
      return;
  }
}

/**
 * Translate one Anthropic-protocol stream event onto the active turn's pi
 * AssistantMessageEventStream. Tolerant of unknown event/delta types and of
 * stop events without a preceding start (both are silently ignored).
 *
 * Tool-use blocks are intentionally NOT translated here. They land via the
 * MCP handler invocation (which happens after the block has fully streamed
 * server-side); the runtime's surfaceToolCall does the pi-side emission.
 */
export function handleStreamEvent(ctx: TranslatorContext, event: any): void {
  const turn = ctx.activeTurn;
  if (!turn || turn.finalized) return;

  if (event?.type === "message_start") {
    const usage = event.message?.usage;
    if (usage) applyUsage(turn.output, usage, ctx.model);
    return;
  }

  if (event?.type === "content_block_start") {
    const cb = event.content_block;
    const sdkIdx: number = event.index;
    if (cb?.type === "text") {
      turn.output.content.push({ type: "text", text: "" });
      ctx.turnBlockMap.set(sdkIdx, turn.output.content.length - 1);
      turn.stream.push({
        type: "text_start",
        contentIndex: turn.output.content.length - 1,
        partial: turn.output,
      });
    } else if (cb?.type === "thinking") {
      turn.output.content.push({
        type: "thinking",
        thinking: "",
        thinkingSignature: "",
      } as any);
      ctx.turnBlockMap.set(sdkIdx, turn.output.content.length - 1);
      turn.stream.push({
        type: "thinking_start",
        contentIndex: turn.output.content.length - 1,
        partial: turn.output,
      });
    }
    // tool_use blocks: see the function-level docstring.
    return;
  }

  if (event?.type === "content_block_delta") {
    const sdkIdx: number = event.index;
    if (event.delta?.type === "text_delta") {
      const piIdx = ctx.turnBlockMap.get(sdkIdx);
      if (piIdx == null) return;
      const block = turn.output.content[piIdx];
      if (block?.type === "text") {
        block.text += event.delta.text;
        turn.stream.push({
          type: "text_delta",
          contentIndex: piIdx,
          delta: event.delta.text,
          partial: turn.output,
        });
      }
      return;
    }
    if (event.delta?.type === "thinking_delta") {
      const piIdx = ctx.turnBlockMap.get(sdkIdx);
      if (piIdx == null) return;
      const block = turn.output.content[piIdx] as any;
      if (block?.type === "thinking") {
        block.thinking += event.delta.thinking;
        turn.stream.push({
          type: "thinking_delta",
          contentIndex: piIdx,
          delta: event.delta.thinking,
          partial: turn.output,
        });
      }
      return;
    }
    if (event.delta?.type === "signature_delta") {
      const piIdx = ctx.turnBlockMap.get(sdkIdx);
      if (piIdx == null) return;
      const block = turn.output.content[piIdx] as any;
      if (block?.type === "thinking") {
        block.thinkingSignature =
          (block.thinkingSignature ?? "") + event.delta.signature;
      }
      return;
    }
    // input_json_delta and any unknown delta types: ignore.
    return;
  }

  if (event?.type === "content_block_stop") {
    const sdkIdx: number = event.index;
    const piIdx = ctx.turnBlockMap.get(sdkIdx);
    if (piIdx == null) return;
    const block = turn.output.content[piIdx];
    if (!block) return;
    if (block.type === "text") {
      turn.stream.push({
        type: "text_end",
        contentIndex: piIdx,
        content: block.text,
        partial: turn.output,
      });
    } else if (block.type === "thinking") {
      turn.stream.push({
        type: "thinking_end",
        contentIndex: piIdx,
        content: (block as any).thinking,
        partial: turn.output,
      });
    }
    return;
  }

  if (event?.type === "message_delta") {
    const usage = event.usage ?? {};
    applyUsage(turn.output, usage, ctx.model);
    return;
  }
}

export function applyUsage(
  output: AssistantMessage,
  usage: any,
  model: Model<any>,
): void {
  if (usage.input_tokens != null) output.usage.input = usage.input_tokens;
  if (usage.output_tokens != null) output.usage.output = usage.output_tokens;
  if (usage.cache_read_input_tokens != null)
    output.usage.cacheRead = usage.cache_read_input_tokens;
  if (usage.cache_creation_input_tokens != null)
    output.usage.cacheWrite = usage.cache_creation_input_tokens;
  output.usage.totalTokens =
    output.usage.input +
    output.usage.output +
    output.usage.cacheRead +
    output.usage.cacheWrite;
  calculateCost(model, output.usage);
}
