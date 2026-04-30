/**
 * Live cache-behavior tests for the claude-agent-sdk provider bridge.
 *
 * These tests exercise the real Anthropic API via @anthropic-ai/claude-agent-sdk:
 *   - they cost money,
 *   - they require valid Anthropic auth (e.g. CLAUDE_CODE_OAUTH_TOKEN or
 *     ANTHROPIC_API_KEY) to be visible to the Claude Code binary,
 *   - they take ~30–90 seconds to run.
 *
 * They are skipped unless `RUN_LIVE_TESTS=1` is set in the environment.
 *
 * Each test asserts a *threshold*, not exact token counts — token usage
 * varies between runs. The thresholds are loose enough to absorb model
 * non-determinism but tight enough to catch real regressions in our resume
 * and fork logic.
 */

import type { Context, Message } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import providerFactory, {
  __getBridgeStateForTesting,
  __getCreatedSdkSessionIdsForTesting,
  __shutdownAllForTesting,
} from "../index.js";

const LIVE = process.env.RUN_LIVE_TESTS === "1";
const MODEL_ID = process.env.BENCH_MODEL ?? "claude-opus-4-5";
const TEST_TIMEOUT_MS = 180_000;

// ---------- helpers ----------

type RegisteredProvider = {
  models: any[];
  streamSimple: (model: any, ctx: Context, options?: any) => any;
};

type TurnUsage = {
  cacheRead: number;
  cacheWrite: number;
  input: number;
  output: number;
};

function makeStubPi(): {
  pi: ExtensionAPI;
  provider: () => RegisteredProvider;
} {
  let registered: RegisteredProvider | undefined;
  const pi: any = {
    on: () => {},
    appendEntry: () => {},
    registerCommand: () => {},
    registerProvider: (_id: string, prov: RegisteredProvider) => {
      registered = prov;
    },
  };
  return {
    pi: pi as ExtensionAPI,
    provider: () => {
      if (!registered) throw new Error("provider not registered");
      return registered;
    },
  };
}

async function setupProvider() {
  const stub = makeStubPi();
  await providerFactory(stub.pi);
  const provider = stub.provider();
  const model =
    provider.models.find((m: any) => m.id === MODEL_ID) ?? provider.models[0];
  if (!model) throw new Error(`no model available; wanted ${MODEL_ID}`);
  return { provider, model };
}

async function drive(
  streamSimple: RegisteredProvider["streamSimple"],
  model: any,
  ctx: Context,
  sessionId: string,
  reasoning?: string,
): Promise<{ usage: TurnUsage; assistantMessage: Message }> {
  const stream = streamSimple(model, ctx, { sessionId, reasoning });
  let last: any = null;
  const seenTypes: string[] = [];
  for await (const ev of stream) {
    if (!seenTypes.includes(ev.type)) seenTypes.push(ev.type);
    if (ev.type === "done" || ev.type === "error") last = ev;
  }
  if (!last) throw new Error(`no done event; saw=${seenTypes.join(",")}`);
  if (last.type === "error") {
    throw new Error(
      `stream error: ${last.error?.errorMessage ?? "unknown"}; reason=${last.reason}`,
    );
  }
  const msg = last.message;
  return {
    assistantMessage: {
      role: "assistant",
      content: msg.content,
      api: msg.api,
      provider: msg.provider,
      model: msg.model,
      usage: msg.usage,
      stopReason: msg.stopReason,
      timestamp: msg.timestamp,
    } as Message,
    usage: {
      cacheRead: msg.usage.cacheRead,
      cacheWrite: msg.usage.cacheWrite,
      input: msg.usage.input,
      output: msg.usage.output,
    },
  };
}

function pushUser(ctx: Context, text: string, ts?: number) {
  ctx.messages.push({
    role: "user",
    content: text,
    timestamp: ts ?? Date.now(),
  });
}

/**
 * Per-test cache-bust nonce. Prepended to the first user message of a test
 * so that the prefix bytes Anthropic caches are unique to *this* test run.
 * Without it, a prior run's prefix can sit in Anthropic's cache and turn 1
 * of a fresh run would falsely appear to "read from cache" — masking real
 * regressions where turn 1 → turn 2 prefix bytes diverge.
 *
 * The nonce stays fixed within a test (so turn 1 → turn 2 cache hits are
 * meaningful) but rotates between tests.
 */
function makeCacheBustNonce(): string {
  return `cache-bust-nonce-${randomUUID()}`;
}

function pushFirstUser(ctx: Context, nonce: string, text: string, ts?: number) {
  pushUser(ctx, `[${nonce}]\n\n${text}`, ts);
}

// Standard pi tool definitions for tests. Mirror what the pi CLI registers
// at runtime. The `parameters` object is rendered into the tool description
// (via the JSON-Schema-in-description fallback the bridge uses) so the
// model sees the argument shape.
const PI_TOOLS: any[] = [
  {
    name: "bash",
    description: "Execute a bash command and return its stdout/stderr.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command to run." },
        timeout: {
          type: "number",
          description: "Optional timeout in seconds.",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "read",
    description: "Read a file from disk.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute path to the file." },
        offset: { type: "number" },
        limit: { type: "number" },
      },
      required: ["path"],
    },
  },
];

function pushToolResult(
  ctx: Context,
  toolCallId: string,
  toolName: string,
  text: string,
  ts?: number,
) {
  ctx.messages.push({
    role: "toolResult",
    toolCallId,
    toolName,
    content: [{ type: "text", text }],
    isError: false,
    timestamp: ts ?? Date.now(),
  } as any);
}

// Threshold for "this turn was a cache miss / cold-seed". Real cold-seeds in
// the bench wrote 7000–15000 tokens. Anything under 1500 is unambiguously a
// cache hit on the new tail (the tail itself is a few hundred tokens).
//
// This is the load-bearing threshold for catching cold-seed regressions:
// the original bug rewrote ~13k tokens *every* turn, so any small cW
// unambiguously means the bridge isn't cold-seeding on resume.
const CACHE_HIT_WRITE_LIMIT = 1500;

// Threshold for "we got a meaningful cache read". The static prefix
// (system prompt + tool schemas) is ~9000 tokens, so any successful cache
// hit is well above this.
//
// We avoid asserting cacheRead on the *first* turn-over-turn transition
// (turn 1 → turn 2): Anthropic's just-written cache from turn 1
// occasionally hasn't fully committed by the time turn 2 fires, producing
// an intermittent partial cache hit (only the cross-test static prefix
// hits, ~4k tokens). Turn 3 reads turn 2's cache reliably, so multi-turn
// tests assert cacheRead on turn 3.
const CACHE_READ_MIN = 5000;

// ---------- tests ----------

describe(
  "claude-agent-sdk-pi cache behavior",
  { skip: !LIVE, timeout: TEST_TIMEOUT_MS },
  () => {
    // Without this, persistent runtimes from prior tests stay alive: their
    // SDK subprocesses keep running, their drainer loops keep awaiting on
    // never-closing iterators, and the runner never exits.
    afterEach(async () => {
      await __shutdownAllForTesting();
    });

    it("linear conversation reuses the same SDK session (resume, not cold-seed-per-turn)", async () => {
      // This is the structural precondition for all the other tests' claims
      // about resume behavior. Cache thresholds alone cannot detect a
      // regression where every turn cold-seeds, because each cold-seed prompt
      // is byte-identical-prefix to the prior one (just one tail entry
      // longer), so Anthropic's prefix cache hits anyway. The user-visible
      // symptom of that regression is the model hallucinating "a previous
      // agent got stuck" because cold-seed embeds prior turns as text under
      // `ASSISTANT:` headers and `Historical tool call (non-executable):`
      // markers in a single user-role message.
      const { provider, model } = await setupProvider();
      const sessionId = randomUUID();
      const ctx: Context = { messages: [], systemPrompt: "" };
      const nonce = makeCacheBustNonce();

      pushFirstUser(ctx, nonce, "Q1: 2+2=? Number only.");
      const r1 = await drive(provider.streamSimple, model, ctx, sessionId);
      ctx.messages.push(r1.assistantMessage);

      const afterTurn1 = __getBridgeStateForTesting(sessionId);
      assert.ok(afterTurn1, "bridge state should exist after turn 1");
      const sdkSessionAfterTurn1 = afterTurn1!.sdkSessionId;

      pushUser(ctx, "Q2: 3+3=? Number only.", Date.now() + 1000);
      const r2 = await drive(provider.streamSimple, model, ctx, sessionId);
      ctx.messages.push(r2.assistantMessage);

      const afterTurn2 = __getBridgeStateForTesting(sessionId);
      assert.ok(afterTurn2, "bridge state should still exist after turn 2");
      assert.equal(
        afterTurn2!.sdkSessionId,
        sdkSessionAfterTurn1,
        `turn 2 used a different SDK session (${afterTurn2!.sdkSessionId}) than turn 1 (${sdkSessionAfterTurn1}); resume is not happening, every turn is cold-seeding`,
      );

      // And confirm only one SDK session was ever created for this pi session.
      const created = __getCreatedSdkSessionIdsForTesting(sessionId);
      assert.equal(
        created.length,
        1,
        `expected exactly 1 SDK session for a 2-turn linear conversation, got ${created.length}: ${created.join(", ")}`,
      );
    });

    it("linear conversation without thinking caches the prefix turn-over-turn", async () => {
      const { provider, model } = await setupProvider();
      const sessionId = randomUUID();
      const ctx: Context = { messages: [], systemPrompt: "" };
      const usages: TurnUsage[] = [];
      const nonce = makeCacheBustNonce();

      for (let i = 0; i < 3; i++) {
        const text = `Question ${i + 1}: what is ${i + 2}+${i + 2}? Just the number.`;
        if (i === 0) {
          pushFirstUser(ctx, nonce, text, Date.now());
        } else {
          pushUser(ctx, text, Date.now() + i * 1000);
        }
        const r = await drive(provider.streamSimple, model, ctx, sessionId);
        ctx.messages.push(r.assistantMessage);
        usages.push(r.usage);
      }

      // Assert on turn 3 — see CACHE_READ_MIN comment for why we skip
      // turn 2 here.
      assert.ok(
        usages[2]!.cacheRead >= CACHE_READ_MIN,
        `turn 3 cacheRead=${usages[2]!.cacheRead} expected >= ${CACHE_READ_MIN}`,
      );
      assert.ok(
        usages[2]!.cacheWrite < CACHE_HIT_WRITE_LIMIT,
        `turn 3 cacheWrite=${usages[2]!.cacheWrite} expected < ${CACHE_HIT_WRITE_LIMIT}`,
      );
    });

    it("linear conversation with adaptive thinking still caches (regression for the original bug)", async () => {
      const { provider, model } = await setupProvider();
      const sessionId = randomUUID();
      const ctx: Context = { messages: [], systemPrompt: "" };
      const usages: TurnUsage[] = [];
      const nonce = makeCacheBustNonce();

      for (let i = 0; i < 3; i++) {
        const text = `Q${i + 1}: ${i + 2}+${i + 2}=? Number only.`;
        if (i === 0) {
          pushFirstUser(ctx, nonce, text, Date.now());
        } else {
          pushUser(ctx, text, Date.now() + i * 1000);
        }
        const r = await drive(
          provider.streamSimple,
          model,
          ctx,
          sessionId,
          "medium",
        );
        ctx.messages.push(r.assistantMessage);
        usages.push(r.usage);
      }

      // The original bug rewrote ~13k tokens *every* turn under thinking;
      // the fix puts us back in the no-thinking regime. Asserting turn 3
      // is sufficient to catch a regression — see CACHE_READ_MIN comment
      // for why we skip turn 2 here.
      assert.ok(
        usages[2]!.cacheWrite < CACHE_HIT_WRITE_LIMIT,
        `turn 3 cacheWrite=${usages[2]!.cacheWrite} indicates the thinking-cache-bust regressed`,
      );
      assert.ok(
        usages[2]!.cacheRead >= CACHE_READ_MIN,
        `turn 3 cacheRead=${usages[2]!.cacheRead} expected >= ${CACHE_READ_MIN}`,
      );
    });

    it("tool call + tool result round-trip: pi-side names, mapped args, cached, surfaces thinking", async () => {
      const { provider, model } = await setupProvider();
      const sessionId = randomUUID();
      const ctx: Context = { messages: [], systemPrompt: "", tools: PI_TOOLS };
      const nonce = makeCacheBustNonce();

      pushFirstUser(
        ctx,
        nonce,
        "Run the bash tool with command `echo hello`. Just call the tool, no explanation.",
      );
      const r1 = await drive(
        provider.streamSimple,
        model,
        ctx,
        sessionId,
        "medium",
      );
      const blocks = (r1.assistantMessage as any).content;
      const toolCall = blocks.find((b: any) => b.type === "toolCall");
      assert.ok(toolCall, "model did not emit a tool call");

      // Tool name must match what we registered (pi-side, lowercase).
      assert.equal(
        toolCall.name,
        "bash",
        `expected pi tool name "bash", got "${toolCall.name}"`,
      );
      assert.ok(
        typeof toolCall.arguments?.command === "string",
        `expected toolCall.arguments.command to be a string, got ${JSON.stringify(toolCall.arguments)}`,
      );

      assert.ok(
        blocks.some((b: any) => b.type === "thinking"),
        "adaptive thinking should produce a thinking block in the assistant message",
      );
      ctx.messages.push(r1.assistantMessage);

      pushToolResult(
        ctx,
        toolCall.id,
        toolCall.name,
        "hello",
        Date.now() + 1000,
      );
      const r2 = await drive(
        provider.streamSimple,
        model,
        ctx,
        sessionId,
        "medium",
      );
      ctx.messages.push(r2.assistantMessage);

      // Injecting the tool_result via SDKUserMessage with parent_tool_use_id
      // must not cold-seed. We assert cW only (not cR) — see
      // CACHE_HIT_WRITE_LIMIT and CACHE_READ_MIN comments. This test only
      // runs 2 pi-turns by design, so there's no turn 3 to use as a
      // stable cR check.
      assert.ok(
        r2.usage.cacheWrite < CACHE_HIT_WRITE_LIMIT,
        `tool round-trip turn 2 cacheWrite=${r2.usage.cacheWrite} expected < ${CACHE_HIT_WRITE_LIMIT}`,
      );
    });

    it("model invokes the read tool with pi's parameter shape (path, not file_path)", async () => {
      const { provider, model } = await setupProvider();
      const sessionId = randomUUID();
      const ctx: Context = { messages: [], systemPrompt: "", tools: PI_TOOLS };
      const nonce = makeCacheBustNonce();

      pushFirstUser(
        ctx,
        nonce,
        "Use the read tool to read /etc/hostname. Just call the tool with that absolute path. No explanation.",
      );
      const r1 = await drive(provider.streamSimple, model, ctx, sessionId);
      const toolCall = (r1.assistantMessage as any).content.find(
        (b: any) => b.type === "toolCall",
      );
      assert.ok(toolCall, "model did not emit a tool call");
      assert.equal(
        toolCall.name,
        "read",
        `expected pi tool name "read", got "${toolCall.name}"`,
      );
      assert.ok(
        typeof toolCall.arguments?.path === "string",
        `expected toolCall.arguments.path to be a string, got ${JSON.stringify(toolCall.arguments)}`,
      );
      assert.equal(
        (toolCall.arguments as any).file_path,
        undefined,
        "file_path should not appear; we register read with `path` and the model should use that",
      );
    });

    it("injected tool result content actually shapes the next assistant turn", async () => {
      const { provider, model } = await setupProvider();
      const sessionId = randomUUID();
      const ctx: Context = { messages: [], systemPrompt: "", tools: PI_TOOLS };
      const nonce = makeCacheBustNonce();

      // A distinctive sentinel so we can verify the model received our
      // injected tool_result and didn't just hallucinate. The first user
      // message asks the model to read a file whose contents the model
      // can't predict — without seeing the injected tool_result, the
      // model has nothing to fall back on. (An `echo X` command tempts
      // the model to paraphrase X regardless of what the tool actually
      // returned.) The file path doesn't need to exist on disk: the
      // bridge intercepts the tool call and our injected tool_result
      // takes its place.
      const SENTINEL = "PURPLE-MARMOT-7194";

      pushFirstUser(
        ctx,
        nonce,
        "Use the read tool to read /tmp/sentinel.txt. Just call the tool once, no explanation.",
      );
      const r1 = await drive(provider.streamSimple, model, ctx, sessionId);
      const toolCall = (r1.assistantMessage as any).content.find(
        (b: any) => b.type === "toolCall",
      );
      assert.ok(toolCall, "model did not emit a tool call");
      ctx.messages.push(r1.assistantMessage);

      // Inject the sentinel as the tool result and ask the model to echo
      // it. The tool_result + follow-up question land in one pi-side call,
      // exercising the resolve-tool + followUpUserMessages decision
      // branch.
      pushToolResult(
        ctx,
        toolCall.id,
        toolCall.name,
        SENTINEL,
        Date.now() + 1000,
      );
      pushUser(
        ctx,
        "What exactly did the tool output? Reply with only the literal output, no quotes, no explanation.",
        Date.now() + 2000,
      );
      const r2 = await drive(provider.streamSimple, model, ctx, sessionId);

      const text = (r2.assistantMessage as any).content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text ?? "")
        .join("");
      assert.ok(
        text.includes(SENTINEL),
        `assistant did not echo the injected tool result; got: ${JSON.stringify(text)}`,
      );
    });

    it("multiple tool calls in one assistant turn round-trip correctly", async () => {
      const { provider, model } = await setupProvider();
      const sessionId = randomUUID();
      const ctx: Context = { messages: [], systemPrompt: "", tools: PI_TOOLS };
      const nonce = makeCacheBustNonce();

      pushFirstUser(
        ctx,
        nonce,
        "Make exactly two tool calls in this turn: call the bash tool with `echo first`, AND call the bash tool with `echo second`. Both calls in this single response.",
      );
      const r1 = await drive(provider.streamSimple, model, ctx, sessionId);
      const toolCalls = (r1.assistantMessage as any).content.filter(
        (b: any) => b.type === "toolCall",
      );
      if (toolCalls.length < 2) {
        // Some models won't honor the request reliably. Don't make this a
        // flaky assertion; skip the rest. The single-tool case is covered
        // elsewhere.
        console.warn(
          `model emitted ${toolCalls.length} tool calls; skipping multi-tool assertions`,
        );
        return;
      }
      ctx.messages.push(r1.assistantMessage);

      // Inject results in order. Each becomes its own SDKUserMessage with
      // parent_tool_use_id; the bridge sends the non-final ones with
      // shouldQuery: false and the last one with shouldQuery: true.
      const RESULTS = ["FIRST-RESULT-AAA", "SECOND-RESULT-BBB"];
      for (let i = 0; i < toolCalls.length; i++) {
        pushToolResult(
          ctx,
          toolCalls[i].id,
          toolCalls[i].name,
          RESULTS[i] ?? "ok",
          Date.now() + (i + 1) * 1000,
        );
      }

      const r2 = await drive(provider.streamSimple, model, ctx, sessionId);
      ctx.messages.push(r2.assistantMessage);

      // Cache should not cold-seed despite multiple tool result entries.
      // We assert cW only (not cR) — see CACHE_HIT_WRITE_LIMIT and
      // CACHE_READ_MIN comments.
      assert.ok(
        r2.usage.cacheWrite < CACHE_HIT_WRITE_LIMIT,
        `multi-tool turn 2 cacheWrite=${r2.usage.cacheWrite} expected < ${CACHE_HIT_WRITE_LIMIT}`,
      );

      // Ask the model what it saw — both injected results should be visible.
      pushUser(
        ctx,
        "What were the exact outputs from the two tools? Reply with both literal outputs separated by a comma, no explanation.",
        Date.now() + 10000,
      );
      const r3 = await drive(provider.streamSimple, model, ctx, sessionId);
      const text = (r3.assistantMessage as any).content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text ?? "")
        .join("");
      for (const sentinel of RESULTS.slice(0, toolCalls.length)) {
        assert.ok(
          text.includes(sentinel),
          `assistant missed injected tool result ${sentinel}; got: ${JSON.stringify(text)}`,
        );
      }
    });

    it("rewind to an earlier turn forks the SDK session and preserves cache through the fork point", async () => {
      const { provider, model } = await setupProvider();
      const sessionId = randomUUID();
      const ctx: Context = { messages: [], systemPrompt: "" };
      const nonce = makeCacheBustNonce();

      // Three linear turns.
      for (let i = 0; i < 3; i++) {
        const text = `Q${i + 1}: ${i + 2}+${i + 2}=? Number only.`;
        if (i === 0) {
          pushFirstUser(ctx, nonce, text, Date.now());
        } else {
          pushUser(ctx, text, Date.now() + i * 1000);
        }
        const r = await drive(provider.streamSimple, model, ctx, sessionId);
        ctx.messages.push(r.assistantMessage);
      }

      // Drop turn 3's user+assistant pair, ask a different question — this is
      // a divergence at index 4 (out of 6) with a single new tail entry, so
      // the bridge should fork at turn 2's assistant and resume.
      ctx.messages.splice(ctx.messages.length - 2, 2);
      pushUser(
        ctx,
        "Different question: what is 100+100? Just the number.",
        Date.now() + 10000,
      );
      const fork = await drive(provider.streamSimple, model, ctx, sessionId);
      ctx.messages.push(fork.assistantMessage);

      assert.ok(
        fork.usage.cacheRead >= CACHE_READ_MIN,
        `fork turn cacheRead=${fork.usage.cacheRead} expected >= ${CACHE_READ_MIN} (fork should preserve cache)`,
      );
      assert.ok(
        fork.usage.cacheWrite < CACHE_HIT_WRITE_LIMIT,
        `fork turn cacheWrite=${fork.usage.cacheWrite} expected < ${CACHE_HIT_WRITE_LIMIT} (fork should not cold-seed)`,
      );

      // Continue past the fork — should still cache.
      pushUser(ctx, "And 200+200?", Date.now() + 11000);
      const post = await drive(provider.streamSimple, model, ctx, sessionId);
      assert.ok(
        post.usage.cacheRead >= CACHE_READ_MIN,
        `post-fork cacheRead=${post.usage.cacheRead} expected >= ${CACHE_READ_MIN}`,
      );
      assert.ok(
        post.usage.cacheWrite < CACHE_HIT_WRITE_LIMIT,
        `post-fork cacheWrite=${post.usage.cacheWrite} expected < ${CACHE_HIT_WRITE_LIMIT}`,
      );
    });
  },
);
