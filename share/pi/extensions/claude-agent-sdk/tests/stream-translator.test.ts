/**
 * Unit tests for the SDK→pi stream translator.
 *
 * The translator pattern-matches on Anthropic's raw streaming protocol
 * shapes (`event.type`, `event.delta.type`, `content_block.type`). These
 * are exposed via `includePartialMessages: true` on the SDK and are not
 * promised to be stable across SDK versions. These tests pin the
 * contract: synthesized event sequences exercise the happy paths and the
 * error/resilience paths, so any future protocol drift fails here loudly
 * instead of producing subtly wrong pi-side events at runtime.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  AssistantMessage,
  AssistantMessageEvent,
  Model,
} from "@mariozechner/pi-ai";

import {
  handleSdkMessage,
  handleStreamEvent,
  type TranslatorContext,
} from "../src/stream-translator.js";
import type { ActiveTurn } from "../src/types.js";

// ---------- harness ----------

type FakeStream = {
  pushed: AssistantMessageEvent[];
  push: (e: AssistantMessageEvent) => void;
  end: () => void;
  ended: boolean;
};

function makeFakeStream(): FakeStream {
  const fake: FakeStream = {
    pushed: [],
    ended: false,
    push: (e) => {
      fake.pushed.push(e);
    },
    end: () => {
      fake.ended = true;
    },
  };
  return fake;
}

function makeOutput(): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: "claude-agent-sdk",
    provider: "anthropic",
    model: "claude-haiku-4-5",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: 0,
  };
}

const FAKE_MODEL: Model<any> = {
  id: "claude-haiku-4-5",
  name: "Haiku 4.5",
  api: "claude-agent-sdk",
  provider: "anthropic",
  baseUrl: "",
  reasoning: false,
  input: [],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 0,
  maxTokens: 0,
} as unknown as Model<any>;

function makeContext(): {
  ctx: TranslatorContext;
  turn: ActiveTurn;
  stream: FakeStream;
  finalizeCalls: Array<"stop" | "length" | "toolUse" | "error" | "aborted">;
} {
  const stream = makeFakeStream();
  const output = makeOutput();
  const turn: ActiveTurn = {
    stream: stream as unknown as ActiveTurn["stream"],
    output,
    done: { promise: Promise.resolve(), resolve: () => {}, reject: () => {} },
    finalized: false,
  };
  const finalizeCalls: Array<
    "stop" | "length" | "toolUse" | "error" | "aborted"
  > = [];
  const ctx: TranslatorContext = {
    model: FAKE_MODEL,
    activeTurn: turn,
    turnBlockMap: new Map(),
    sdkSessionId: undefined,
    createdSdkSessionIds: new Set(),
    finalizeTurn: (reason) => {
      finalizeCalls.push(reason);
      turn.finalized = true;
    },
  };
  return { ctx, turn, stream, finalizeCalls };
}

// ---------- tests ----------

describe("handleStreamEvent — text block", () => {
  it("emits text_start, text_delta(s), text_end and accumulates text on the block", () => {
    const { ctx, turn, stream } = makeContext();

    handleStreamEvent(ctx, {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text" },
    });
    handleStreamEvent(ctx, {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "Hel" },
    });
    handleStreamEvent(ctx, {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "lo" },
    });
    handleStreamEvent(ctx, { type: "content_block_stop", index: 0 });

    assert.equal(turn.output.content.length, 1);
    assert.deepEqual(turn.output.content[0], { type: "text", text: "Hello" });

    const types = stream.pushed.map((e) => e.type);
    assert.deepEqual(types, [
      "text_start",
      "text_delta",
      "text_delta",
      "text_end",
    ]);
    assert.equal((stream.pushed[3] as any).content, "Hello");
  });
});

describe("handleStreamEvent — thinking block", () => {
  it("emits thinking_start, thinking_delta(s), thinking_end and accumulates thinking + signature", () => {
    const { ctx, turn, stream } = makeContext();

    handleStreamEvent(ctx, {
      type: "content_block_start",
      index: 0,
      content_block: { type: "thinking" },
    });
    handleStreamEvent(ctx, {
      type: "content_block_delta",
      index: 0,
      delta: { type: "thinking_delta", thinking: "I'll " },
    });
    handleStreamEvent(ctx, {
      type: "content_block_delta",
      index: 0,
      delta: { type: "thinking_delta", thinking: "think." },
    });
    handleStreamEvent(ctx, {
      type: "content_block_delta",
      index: 0,
      delta: { type: "signature_delta", signature: "abc" },
    });
    handleStreamEvent(ctx, {
      type: "content_block_delta",
      index: 0,
      delta: { type: "signature_delta", signature: "def" },
    });
    handleStreamEvent(ctx, { type: "content_block_stop", index: 0 });

    assert.equal(turn.output.content.length, 1);
    const block = turn.output.content[0] as any;
    assert.equal(block.type, "thinking");
    assert.equal(block.thinking, "I'll think.");
    assert.equal(block.thinkingSignature, "abcdef");

    const types = stream.pushed.map((e) => e.type);
    assert.deepEqual(types, [
      "thinking_start",
      "thinking_delta",
      "thinking_delta",
      "thinking_end",
    ]);
    // signature_delta is internal — does not surface to pi.
  });
});

describe("handleStreamEvent — multiple blocks in one turn", () => {
  it("maps non-contiguous SDK indexes to correct pi content positions", () => {
    // SDK can emit blocks with index 0, 1, 2 (or even non-monotonic) that
    // pi sees as a flat content array. The turnBlockMap is what keeps
    // them aligned.
    const { ctx, turn, stream } = makeContext();

    // Block 0: text
    handleStreamEvent(ctx, {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text" },
    });
    handleStreamEvent(ctx, {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "first" },
    });
    handleStreamEvent(ctx, { type: "content_block_stop", index: 0 });

    // Block 1: thinking
    handleStreamEvent(ctx, {
      type: "content_block_start",
      index: 1,
      content_block: { type: "thinking" },
    });
    handleStreamEvent(ctx, {
      type: "content_block_delta",
      index: 1,
      delta: { type: "thinking_delta", thinking: "ponder" },
    });
    handleStreamEvent(ctx, { type: "content_block_stop", index: 1 });

    // Block 2: text
    handleStreamEvent(ctx, {
      type: "content_block_start",
      index: 2,
      content_block: { type: "text" },
    });
    handleStreamEvent(ctx, {
      type: "content_block_delta",
      index: 2,
      delta: { type: "text_delta", text: "third" },
    });
    handleStreamEvent(ctx, { type: "content_block_stop", index: 2 });

    assert.equal(turn.output.content.length, 3);
    assert.equal((turn.output.content[0] as any).text, "first");
    assert.equal((turn.output.content[1] as any).thinking, "ponder");
    assert.equal((turn.output.content[2] as any).text, "third");

    // Pi event indices reflect pi-side positions, not SDK indices.
    const deltas = stream.pushed.filter((e) =>
      e.type.endsWith("_delta"),
    ) as Array<AssistantMessageEvent & { contentIndex: number }>;
    assert.deepEqual(
      deltas.map((d) => d.contentIndex),
      [0, 1, 2],
    );
  });
});

describe("handleStreamEvent — tool_use blocks are NOT translated", () => {
  it("ignores content_block_start for tool_use (handler invocation drives surfacing)", () => {
    const { ctx, turn, stream } = makeContext();

    handleStreamEvent(ctx, {
      type: "content_block_start",
      index: 0,
      content_block: { type: "tool_use", id: "toolu_x", name: "mcp__pi__bash" },
    });
    handleStreamEvent(ctx, {
      type: "content_block_delta",
      index: 0,
      delta: { type: "input_json_delta", partial_json: '{"command":' },
    });
    handleStreamEvent(ctx, { type: "content_block_stop", index: 0 });

    // No content blocks added, no events pushed: tool surfacing is the
    // MCP handler's job, not the translator's.
    assert.equal(turn.output.content.length, 0);
    assert.equal(stream.pushed.length, 0);
  });
});

describe("handleStreamEvent — robustness", () => {
  it("ignores content_block_stop for an SDK index it never saw start", () => {
    const { ctx, turn, stream } = makeContext();
    handleStreamEvent(ctx, { type: "content_block_stop", index: 7 });
    assert.equal(turn.output.content.length, 0);
    assert.equal(stream.pushed.length, 0);
  });

  it("ignores deltas for unknown block indices", () => {
    const { ctx, stream } = makeContext();
    handleStreamEvent(ctx, {
      type: "content_block_delta",
      index: 99,
      delta: { type: "text_delta", text: "lost" },
    });
    assert.equal(stream.pushed.length, 0);
  });

  it("ignores deltas with unknown delta.type", () => {
    const { ctx, turn, stream } = makeContext();
    handleStreamEvent(ctx, {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text" },
    });
    stream.pushed.length = 0; // reset to look at just the delta
    handleStreamEvent(ctx, {
      type: "content_block_delta",
      index: 0,
      delta: { type: "future_unknown_delta_kind", value: "x" },
    });
    assert.equal(stream.pushed.length, 0);
    assert.equal((turn.output.content[0] as any).text, "");
  });

  it("ignores events with unknown top-level type", () => {
    const { ctx, stream } = makeContext();
    handleStreamEvent(ctx, { type: "future_unknown_event_kind", payload: 42 });
    assert.equal(stream.pushed.length, 0);
  });

  it("does nothing when there is no active turn", () => {
    const { ctx, stream } = makeContext();
    ctx.activeTurn = undefined;
    handleStreamEvent(ctx, {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text" },
    });
    assert.equal(stream.pushed.length, 0);
  });

  it("does nothing when the active turn is already finalized", () => {
    const { ctx, turn, stream } = makeContext();
    turn.finalized = true;
    handleStreamEvent(ctx, {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text" },
    });
    assert.equal(stream.pushed.length, 0);
  });
});

describe("handleStreamEvent — usage tracking", () => {
  it("records usage from message_start", () => {
    const { ctx, turn } = makeContext();
    handleStreamEvent(ctx, {
      type: "message_start",
      message: {
        usage: {
          input_tokens: 10,
          output_tokens: 20,
          cache_read_input_tokens: 100,
          cache_creation_input_tokens: 5,
        },
      },
    });
    assert.equal(turn.output.usage.input, 10);
    assert.equal(turn.output.usage.output, 20);
    assert.equal(turn.output.usage.cacheRead, 100);
    assert.equal(turn.output.usage.cacheWrite, 5);
    assert.equal(turn.output.usage.totalTokens, 135);
  });

  it("updates usage from message_delta (final counts override message_start)", () => {
    const { ctx, turn } = makeContext();
    handleStreamEvent(ctx, {
      type: "message_start",
      message: { usage: { input_tokens: 10, output_tokens: 20 } },
    });
    handleStreamEvent(ctx, {
      type: "message_delta",
      usage: { output_tokens: 50 },
    });
    assert.equal(turn.output.usage.input, 10);
    assert.equal(turn.output.usage.output, 50);
  });
});

describe("handleSdkMessage — top-level dispatch", () => {
  it("captures sdkSessionId on first message that carries one", () => {
    const { ctx } = makeContext();
    handleSdkMessage(ctx, {
      type: "system",
      subtype: "init",
      session_id: "abc-123",
    } as any);
    assert.equal(ctx.sdkSessionId, "abc-123");
    assert.ok(ctx.createdSdkSessionIds.has("abc-123"));
  });

  it("does not overwrite an already-captured sdkSessionId", () => {
    const { ctx } = makeContext();
    ctx.sdkSessionId = "first";
    ctx.createdSdkSessionIds.add("first");
    handleSdkMessage(ctx, {
      type: "system",
      subtype: "init",
      session_id: "second",
    } as any);
    assert.equal(ctx.sdkSessionId, "first");
  });

  it("finalizes the turn on `result` with mapped stop reason", () => {
    const { ctx, finalizeCalls } = makeContext();
    handleSdkMessage(ctx, {
      type: "result",
      subtype: "success",
      stop_reason: "tool_use",
      usage: { output_tokens: 10 },
    } as any);
    assert.deepEqual(finalizeCalls, ["toolUse"]);
  });

  it("does not apply usage from `result` (it's cumulative across the query lifetime)", () => {
    // The SDK's `result` message reports usage summed over every API call
    // made by the current `query()` invocation. When a tool_use parks an
    // SDK turn (pi turn 1) and a follow-up resolves it (pi turn 2), one
    // result event covers both API calls and applying its usage would
    // clobber the per-call totals already accumulated from
    // message_start/message_delta — making turn 2 appear to have
    // rewritten the entire prefix again.
    const { ctx, turn } = makeContext();
    turn.output.usage.cacheWrite = 108;
    turn.output.usage.cacheRead = 11432;
    handleSdkMessage(ctx, {
      type: "result",
      subtype: "success",
      stop_reason: "end_turn",
      usage: {
        cache_creation_input_tokens: 7268,
        cache_read_input_tokens: 15704,
        input_tokens: 18,
        output_tokens: 110,
      },
    } as any);
    assert.equal(turn.output.usage.cacheWrite, 108);
    assert.equal(turn.output.usage.cacheRead, 11432);
  });

  it("maps end_turn → stop", () => {
    const { ctx, turn, finalizeCalls } = makeContext();
    handleSdkMessage(ctx, {
      type: "result",
      subtype: "success",
      stop_reason: "end_turn",
      usage: {},
    } as any);
    assert.deepEqual(finalizeCalls, ["stop"]);
    assert.equal(turn.output.stopReason, "stop");
  });

  it("maps max_tokens → length", () => {
    const { ctx, turn, finalizeCalls } = makeContext();
    handleSdkMessage(ctx, {
      type: "result",
      subtype: "success",
      stop_reason: "max_tokens",
      usage: {},
    } as any);
    assert.deepEqual(finalizeCalls, ["length"]);
    assert.equal(turn.output.stopReason, "length");
  });

  it("ignores `result` events with num_turns=0 (CLI-internal sub-tasks)", () => {
    // On cold-start the CLI emits a `result` for an internal sub-task —
    // session-title generation — that completes with num_turns=0 before
    // the real user query begins. Finalizing on it shipped an empty
    // assistant; the real result that closes the user query has
    // num_turns>=1.
    const { ctx, turn, finalizeCalls } = makeContext();
    handleSdkMessage(ctx, {
      type: "result",
      subtype: "success",
      stop_reason: null,
      num_turns: 0,
      duration_ms: 7,
      is_error: false,
    } as any);
    assert.equal(finalizeCalls.length, 0);
    assert.equal(turn.finalized, false);

    // The real result then arrives and finalizes correctly.
    handleSdkMessage(ctx, {
      type: "result",
      subtype: "success",
      stop_reason: "end_turn",
      num_turns: 1,
    } as any);
    assert.deepEqual(finalizeCalls, ["stop"]);
  });

  it("ignores message types it does not recognize", () => {
    const { ctx, finalizeCalls, stream } = makeContext();
    handleSdkMessage(ctx, { type: "future_message_type", payload: 1 } as any);
    assert.equal(finalizeCalls.length, 0);
    assert.equal(stream.pushed.length, 0);
  });
});
