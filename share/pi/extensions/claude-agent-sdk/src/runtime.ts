import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Context,
  type Model,
  type SimpleStreamOptions,
  type Tool,
} from "@earendil-works/pi-ai";
import {
  deleteSession,
  forkSession,
  getSessionInfo,
  getSessionMessages,
  type SessionStore,
  query,
  type SDKUserMessage,
  type ThinkingConfig,
} from "@anthropic-ai/claude-agent-sdk";

import {
  buildForkTail,
  type ColdSeedReason,
  decideTurnAction,
  tryWarmResume,
  type TurnDecision,
} from "./decision.js";
import { buildPiMcpServer, type ToolCallSink } from "./pi-mcp-server.js";
import { buildColdSeedMessages, buildSyntheticSession } from "./pi-to-sdk.js";
import {
  loadSidecar,
  saveSidecar,
  sidecarPathFor,
  type SidecarV1,
} from "./sidecar.js";
import {
  resolveClaudeCodeExecutable,
  extractAgentsAppend,
  extractSkillsAppend,
  loadProviderSettings,
} from "./settings.js";
import {
  buildPiIndexToSdkUuid,
  computeSignatures,
  piMessageSignature,
} from "./state-diff.js";
import {
  handleSdkMessage,
  type TranslatorContext,
} from "./stream-translator.js";
import { randomUUID } from "node:crypto";
import {
  mapThinkingTokens,
  PI_LEVEL_TO_EFFORT,
  supportsAdaptiveThinking,
} from "./thinking.js";
import { maybeRewriteSkillAliasArgs, piToolNameToSdk } from "./tool-mapping.js";
import type { ActiveTurn, PendingToolCall, StaticPrefix } from "./types.js";
import { AsyncMessageQueue, defer } from "./util.js";
import { log } from "./log.js";

/**
 * One persistent runtime per pi session. Hosts a single `query()` that's
 * driven across multiple streamSimple calls.
 *
 * Each MCP tool handler parks a deferred; a later streamSimple call carries
 * the tool result and resolves the deferred to push the result back through
 * the SDK iterator. The drainer translates SDK stream events into the
 * AssistantMessageEventStream pi consumes.
 */
export type SessionRuntime = {
  sessionKey: string;
  model: Model<any>;
  tools: Tool[];
  staticPrefix: StaticPrefix;

  sdkSessionId: string | undefined;
  inputQueue: AsyncMessageQueue<SDKUserMessage>;
  sdkQuery: ReturnType<typeof query>;
  drainer: Promise<void>;

  activeTurn: ActiveTurn | undefined;
  /** Per-active-turn map from SDK content_block index → pi content array index. */
  turnBlockMap: Map<number, number>;

  /** Tool calls the MCP handlers are awaiting, keyed by SDK tool_use_id. */
  pendingToolCalls: Map<string, PendingToolCall>;
  /**
   * Tool calls received from the SDK that we haven't surfaced to pi yet
   * (a previous call from the same assistant turn is still pending).
   * Drained one-at-a-time as pi returns toolResults.
   */
  toolCallQueue: PendingToolCall[];

  /**
   * Reason the most recently finalized turn ended. Used by
   * `onMcpToolCall` to distinguish the legitimate multi-tool-per-SDK-turn
   * case (`"toolUse"`) from a leak: when a tool_use fires its MCP handler
   * after the turn was finalized by abort / error / stop / length, queuing
   * the call would surface it on an unrelated future streamSimple call.
   */
  lastFinalizeReason:
    | "stop"
    | "length"
    | "toolUse"
    | "error"
    | "aborted"
    | undefined;

  lastSignatures: string[];
  sdkUuidByPiIndex: Map<number, string>;
  createdSdkSessionIds: Set<string>;

  isShutdown: boolean;
  /**
   * Set when a pi-side abort fires interrupt() on the SDK query. Awaited at
   * the start of the next streamSimple call so we never push messages into a
   * runtime whose subprocess hasn't acknowledged the interrupt yet.
   */
  pendingInterrupt: Promise<void> | undefined;
  /** True after an interrupt; causes the next call to fork rather than extend. */
  wasInterrupted: boolean;
};

const runtimes = new Map<string, SessionRuntime>();

/**
 * Pi session file path per sessionKey, captured at `session_start`. Used
 * to derive the sidecar path for warm-resume on the first streamSimple
 * after process start.
 */
const piSessionFiles = new Map<string, string>();

export function setPiSessionFile(sessionKey: string, file: string): void {
  piSessionFiles.set(sessionKey, file);
}

export function clearPiSessionFile(sessionKey: string): void {
  piSessionFiles.delete(sessionKey);
}

export function getPiSessionFile(sessionKey: string): string | undefined {
  return piSessionFiles.get(sessionKey);
}

/** Last decision kind / reason actually applied, per sessionKey. Test introspection. */
const lastDecisionInfo = new Map<
  string,
  | { kind: "warm-resume"; sdkSessionId: string }
  | { kind: "cold-seed"; reason: ColdSeedReason }
  | { kind: "linear-extension" }
  | { kind: "resolve-tool" }
  | { kind: "fork" }
>();

export function getLastDecisionInfo(sessionKey: string) {
  return lastDecisionInfo.get(sessionKey);
}

export type SeedNotice =
  | { sessionKey: string; kind: "warm-resume"; sdkSessionId: string }
  | {
      sessionKey: string;
      kind: "cold-seed";
      reason: ColdSeedReason;
    };

let seedNotifier: ((notice: SeedNotice) => void) | undefined;

export function setSeedNotifier(fn: (notice: SeedNotice) => void): void {
  seedNotifier = fn;
}

/**
 * Per-session-key serialization barrier. Each streamSimple call replaces
 * the entry with its own settle promise on entry and awaits the previous
 * one before reading runtime state. Without this, a fast follow-up call
 * can race past the prior call's post-turn bookkeeping (sdkUuidByPiIndex
 * refresh, lastSignatures update) and compute its decision against stale
 * state.
 *
 * Lives outside the runtime so it survives a teardown-and-recreate
 * (cold-seed, fork): the barrier is per session, not per runtime.
 */
const callBarriers = new Map<string, Promise<void>>();

/**
 * Look up an active runtime by session key. Used by the
 * `session_shutdown` handler to find the runtime to tear down, and by
 * the test-only introspection helpers in `index.ts`.
 */
export function getRuntime(sessionKey: string): SessionRuntime | undefined {
  return runtimes.get(sessionKey);
}

/**
 * Test-only: tear down every active runtime, closing SDK subprocesses and
 * stopping drainer loops. Without this, persistent runtimes leak across
 * tests in the same Node process — each test's `streamSimple` spawns a
 * Claude subprocess and an awaiting drainer, neither of which `node:test`
 * knows to clean up. The leak shows up as the runner not exiting after
 * tests finish (open handles holding the event loop alive) and resource
 * pressure failing later tests.
 */
export async function __shutdownAllRuntimesForTesting(): Promise<void> {
  await shutdownAllRuntimes(false);
}

// ---------------------------------------------------------------------------
// Runtime lifecycle
// ---------------------------------------------------------------------------

function createRuntime(args: {
  sessionKey: string;
  model: Model<any>;
  tools: Tool[];
  staticPrefix: StaticPrefix;
  resumeSessionId?: string;
  syntheticSession?: { store: SessionStore; id: string };
  seedMessages: SDKUserMessage[];
  reasoning: SimpleStreamOptions["reasoning"];
  thinkingBudgets: SimpleStreamOptions["thinkingBudgets"];
  preSeededUuidMap?: Map<number, string>;
}): SessionRuntime {
  const inputQueue = new AsyncMessageQueue<SDKUserMessage>();
  for (const msg of args.seedMessages) inputQueue.push(msg);

  // Forward declaration: the runtime object is referenced by the MCP sink.
  const runtimeRef: { current: SessionRuntime | undefined } = {
    current: undefined,
  };
  const sink: ToolCallSink = (call) => {
    if (runtimeRef.current) onMcpToolCall(runtimeRef.current, call);
  };

  const piServer = buildPiMcpServer(args.tools, sink);

  const queryOptions: NonNullable<Parameters<typeof query>[0]["options"]> = {
    cwd: args.staticPrefix.cwd,
    model: args.staticPrefix.modelId,
    tools: args.tools.map((t) => piToolNameToSdk(t.name)),
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    includePartialMessages: true,
    mcpServers: { pi: piServer },
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: args.staticPrefix.systemPromptAppend,
      excludeDynamicSections: true,
    },
    pathToClaudeCodeExecutable: resolveClaudeCodeExecutable(),
    ...(args.staticPrefix.settingSources
      ? { settingSources: args.staticPrefix.settingSources }
      : {}),
    ...(args.staticPrefix.strictMcpConfig
      ? { extraArgs: { "strict-mcp-config": null } }
      : {}),
    ...(args.syntheticSession
      ? {
          resume: args.syntheticSession.id,
          sessionStore: args.syntheticSession.store,
        }
      : args.resumeSessionId
        ? { resume: args.resumeSessionId }
        : {}),
  };

  if (args.reasoning && supportsAdaptiveThinking(args.model.id)) {
    queryOptions.thinking = {
      type: "adaptive",
      display: "summarized",
    } satisfies ThinkingConfig;
    queryOptions.effort = PI_LEVEL_TO_EFFORT[args.reasoning];
  } else {
    const maxThinkingTokens = mapThinkingTokens(
      args.reasoning,
      args.model.id,
      args.thinkingBudgets,
    );
    if (maxThinkingTokens != null) {
      queryOptions.thinking = {
        type: "enabled",
        budgetTokens: maxThinkingTokens,
        display: "summarized",
      } satisfies ThinkingConfig;
    }
  }

  const sdkQuery = query({ prompt: inputQueue, options: queryOptions });

  const runtime: SessionRuntime = {
    sessionKey: args.sessionKey,
    model: args.model,
    tools: args.tools,
    staticPrefix: args.staticPrefix,
    sdkSessionId: args.syntheticSession?.id ?? args.resumeSessionId,
    pendingInterrupt: undefined,
    wasInterrupted: false,
    inputQueue,
    sdkQuery,
    drainer: undefined as unknown as Promise<void>,
    activeTurn: undefined,
    turnBlockMap: new Map(),
    pendingToolCalls: new Map(),
    toolCallQueue: [],
    lastFinalizeReason: undefined,
    lastSignatures: [],
    sdkUuidByPiIndex: new Map(),
    createdSdkSessionIds: new Set(),
    isShutdown: false,
  };
  if (args.resumeSessionId)
    runtime.createdSdkSessionIds.add(args.resumeSessionId);
  if (args.preSeededUuidMap && args.preSeededUuidMap.size > 0) {
    runtime.sdkUuidByPiIndex = new Map(args.preSeededUuidMap);
  }
  runtimeRef.current = runtime;

  log("createRuntime", {
    sessionKey: args.sessionKey,
    resumeSessionId: args.resumeSessionId,
    syntheticSessionId: args.syntheticSession?.id,
    seedCount: args.seedMessages.length,
    preSeededUuids: args.preSeededUuidMap?.size ?? 0,
  });
  runtime.drainer = drainSdk(runtime);
  runtimes.set(args.sessionKey, runtime);
  return runtime;
}

export async function shutdownRuntime(
  runtime: SessionRuntime,
  deleteSdk: boolean,
): Promise<void> {
  if (runtime.isShutdown) return;
  runtime.isShutdown = true;
  runtimes.delete(runtime.sessionKey);

  const shutdownErr = new Error("session runtime shutdown");
  for (const pending of runtime.pendingToolCalls.values()) {
    pending.output.reject(shutdownErr);
  }
  for (const queued of runtime.toolCallQueue) {
    queued.output.reject(shutdownErr);
  }
  runtime.pendingToolCalls.clear();
  runtime.toolCallQueue.length = 0;

  runtime.inputQueue.close();
  try {
    runtime.sdkQuery.close();
  } catch {
    // close() may throw if the iterator already terminated
  }
  try {
    await runtime.drainer;
  } catch {
    // drainer errors surface via the active turn
  }

  if (deleteSdk) {
    for (const id of runtime.createdSdkSessionIds) {
      try {
        await deleteSession(id);
      } catch {
        // best effort
      }
    }
  }
}

export async function shutdownAllRuntimes(deleteSdk: boolean): Promise<void> {
  const all = [...runtimes.values()];
  await Promise.all(all.map((rt) => shutdownRuntime(rt, deleteSdk)));
  // Drop barriers for sessions that no longer have a runtime. Any call
  // currently awaiting one will have already woken up via its settle
  // promise; this clears the dead-session-key entries.
  callBarriers.clear();
}

// ---------------------------------------------------------------------------
// MCP tool-call routing
// ---------------------------------------------------------------------------

function onMcpToolCall(runtime: SessionRuntime, call: PendingToolCall): void {
  call.args = maybeRewriteSkillAliasArgs(
    call.args,
    runtime.staticPrefix.allowSkillAliasRewrite,
  );
  if (
    runtime.pendingToolCalls.size === 0 &&
    runtime.activeTurn &&
    !runtime.activeTurn.finalized
  ) {
    surfaceToolCall(runtime, call);
    return;
  }
  queueOrRejectToolCall(runtime, call);
}

/**
 * Decide whether a tool call that can't be surfaced right now should be
 * queued for the next streamSimple call or rejected outright.
 *
 * Queueing is correct in exactly two cases:
 *   1. An earlier tool from this same SDK turn is still in flight to pi
 *      (`pendingToolCalls.size > 0`). Pi will resolve that one, then on the
 *      follow-up call we drain this queued call as a synthetic toolUse turn.
 *   2. The previous turn was finalized as `"toolUse"` (surfaceToolCall
 *      finalized it after surfacing the first tool of a multi-tool SDK
 *      turn). The next streamSimple call drains the queue.
 *
 * Any other state (no runtime turn yet, or turn finalized as
 * abort/error/stop/length) means surfacing this call later would leak it
 * into an unrelated context. Reject the deferred so the SDK sees a tool
 * error and the runtime fails the turn cleanly instead of hanging pi on a
 * cross-call leak.
 */
function queueOrRejectToolCall(
  runtime: SessionRuntime,
  call: PendingToolCall,
): void {
  if (runtime.pendingToolCalls.size > 0) {
    runtime.toolCallQueue.push(call);
    return;
  }
  if (runtime.lastFinalizeReason === "toolUse") {
    runtime.toolCallQueue.push(call);
    return;
  }
  log("queueOrRejectToolCall: reject", {
    sessionKey: runtime.sessionKey,
    toolUseId: call.toolUseId,
    piToolName: call.piToolName,
    lastFinalizeReason: runtime.lastFinalizeReason ?? "none",
    activeTurn: runtime.activeTurn
      ? runtime.activeTurn.finalized
        ? "finalized"
        : "open"
      : "none",
  });
  call.output.reject(
    new Error(
      `claude-agent-sdk: tool call ${call.toolUseId} dropped — turn finalized as ${runtime.lastFinalizeReason ?? "none"}`,
    ),
  );
}

function surfaceToolCall(runtime: SessionRuntime, call: PendingToolCall): void {
  const turn = runtime.activeTurn;
  if (!turn || turn.finalized) {
    log("surfaceToolCall: no eligible turn, falling back", {
      sessionKey: runtime.sessionKey,
      toolUseId: call.toolUseId,
      activeTurn: turn ? "finalized" : "none",
      lastFinalizeReason: runtime.lastFinalizeReason ?? "none",
    });
    queueOrRejectToolCall(runtime, call);
    return;
  }
  log("surfaceToolCall", {
    sessionKey: runtime.sessionKey,
    toolUseId: call.toolUseId,
    piToolName: call.piToolName,
  });
  runtime.pendingToolCalls.set(call.toolUseId, call);

  const block = {
    type: "toolCall" as const,
    id: call.toolUseId,
    name: call.piToolName,
    arguments: call.args,
  };
  turn.output.content.push(block);
  const idx = turn.output.content.length - 1;
  turn.stream.push({
    type: "toolcall_start",
    contentIndex: idx,
    partial: turn.output,
  });
  turn.stream.push({
    type: "toolcall_end",
    contentIndex: idx,
    toolCall: block,
    partial: turn.output,
  });

  turn.output.stopReason = "toolUse";
  finalizeTurn(runtime, "toolUse");
}

function finalizeTurn(
  runtime: SessionRuntime,
  reason: "stop" | "length" | "toolUse" | "error" | "aborted",
): void {
  const turn = runtime.activeTurn;
  if (!turn || turn.finalized) {
    log("finalizeTurn: no-op", {
      sessionKey: runtime.sessionKey,
      reason,
      activeTurn: turn ? "finalized" : "none",
    });
    return;
  }
  log("finalizeTurn", { sessionKey: runtime.sessionKey, reason });
  turn.finalized = true;
  runtime.lastFinalizeReason = reason;
  if (reason === "error" || reason === "aborted") {
    turn.stream.push({ type: "error", reason, error: turn.output });
  } else {
    turn.stream.push({
      type: "done",
      reason:
        reason === "toolUse"
          ? "toolUse"
          : reason === "length"
            ? "length"
            : "stop",
      message: turn.output,
    });
  }
  turn.stream.end();
  runtime.activeTurn = undefined;
  runtime.turnBlockMap.clear();
  turn.done.resolve();
}

// ---------------------------------------------------------------------------
// SDK drain → pi stream translation
// ---------------------------------------------------------------------------

/**
 * View of a SessionRuntime that the stream translator can consume. The
 * runtime is the producer; the translator only needs read/write access to
 * a few fields plus a way to signal turn-completion.
 */
function asTranslatorContext(runtime: SessionRuntime): TranslatorContext {
  return {
    model: runtime.model,
    get activeTurn() {
      return runtime.activeTurn;
    },
    set activeTurn(v) {
      runtime.activeTurn = v;
    },
    turnBlockMap: runtime.turnBlockMap,
    get sdkSessionId() {
      return runtime.sdkSessionId;
    },
    set sdkSessionId(v) {
      runtime.sdkSessionId = v;
    },
    createdSdkSessionIds: runtime.createdSdkSessionIds,
    finalizeTurn: (reason) => finalizeTurn(runtime, reason),
  } as TranslatorContext;
}

async function drainSdk(runtime: SessionRuntime): Promise<void> {
  const ctx = asTranslatorContext(runtime);
  log("drainSdk: start", { sessionKey: runtime.sessionKey });
  try {
    for await (const message of runtime.sdkQuery) {
      if (runtime.isShutdown) {
        log("drainSdk: break on shutdown", { sessionKey: runtime.sessionKey });
        break;
      }
      const anyMsg = message as any;
      log("drainSdk: message", {
        sessionKey: runtime.sessionKey,
        type: (message as any).type,
        subtype:
          (message as any).type === "stream_event"
            ? anyMsg.event?.type
            : (message as any).type === "result"
              ? `stop=${anyMsg.stop_reason},num_turns=${anyMsg.num_turns}`
              : undefined,
        activeTurn: runtime.activeTurn
          ? runtime.activeTurn.finalized
            ? "finalized"
            : "open"
          : "none",
      });
      handleSdkMessage(ctx, message);
    }
  } catch (err) {
    log("drainSdk: caught error", {
      sessionKey: runtime.sessionKey,
      err,
      activeTurn: runtime.activeTurn
        ? runtime.activeTurn.finalized
          ? "finalized"
          : "open"
        : "none",
    });
    if (runtime.activeTurn && !runtime.activeTurn.finalized) {
      runtime.activeTurn.output.errorMessage =
        err instanceof Error ? err.message : String(err);
      finalizeTurn(runtime, "error");
    }
  }
  if (!runtime.isShutdown) {
    // SDK iterator returned `done` while the runtime is still live.
    // Future streamSimple calls on this runtime will hang at
    // turn.done.promise because no more messages will ever arrive.
    log("drainSdk: exited unexpectedly", {
      sessionKey: runtime.sessionKey,
      pendingTools: runtime.pendingToolCalls.size,
      queuedTools: runtime.toolCallQueue.length,
      activeTurn: runtime.activeTurn
        ? runtime.activeTurn.finalized
          ? "finalized"
          : "open"
        : "none",
    });
  } else {
    log("drainSdk: exit (shutdown)", { sessionKey: runtime.sessionKey });
  }
}

// ---------------------------------------------------------------------------
// Public entrypoint: streamSimple
// ---------------------------------------------------------------------------

export function streamClaudeAgentSdk(
  model: Model<any>,
  context: Context,
  options?: SimpleStreamOptions,
): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream();
  void runStreamCall(model, context, options, stream);
  return stream;
}

async function runStreamCall(
  model: Model<any>,
  context: Context,
  options: SimpleStreamOptions | undefined,
  stream: AssistantMessageEventStream,
): Promise<void> {
  const sessionKey = options?.sessionId ?? randomUUID();
  log("runStreamCall: entry", {
    sessionKey,
    messageCount: context.messages.length,
    signalAborted: options?.signal?.aborted === true,
    hasRuntime: runtimes.has(sessionKey),
  });

  const output = makeOutput(model);
  const turn: ActiveTurn = {
    stream,
    output,
    done: defer<void>(),
    finalized: false,
  };

  const onAbort = () => {
    log("runStreamCall: onAbort", {
      sessionKey,
      turnFinalized: turn.finalized,
      hasRuntime: runtimes.has(sessionKey),
    });
    const rt = runtimes.get(sessionKey);
    if (rt) {
      const shutdownErr = new Error("session interrupted");
      for (const pending of rt.pendingToolCalls.values())
        pending.output.reject(shutdownErr);
      for (const queued of rt.toolCallQueue) queued.output.reject(shutdownErr);
      rt.pendingToolCalls.clear();
      rt.toolCallQueue.length = 0;
      rt.wasInterrupted = true;
      rt.pendingInterrupt = rt.sdkQuery.interrupt();
    }
    if (!turn.finalized) {
      output.stopReason = "aborted";
      output.errorMessage = "Operation aborted";
      turn.finalized = true;
      if (rt) rt.lastFinalizeReason = "aborted";
      stream.push({ type: "error", reason: "aborted", error: output });
      stream.end();
      turn.done.resolve();
    }
  };
  if (options?.signal) {
    if (options.signal.aborted) {
      log("runStreamCall: signal already aborted at entry", { sessionKey });
      onAbort();
    } else {
      options.signal.addEventListener("abort", onAbort, { once: true });
    }
  }

  // Serialize calls per session: wait for the previous call's bookkeeping
  // (e.g., refreshSdkUuidMap) before reading runtime state. Without this,
  // a fast follow-up call can race past a not-yet-completed map refresh.
  // The barrier lives in callBarriers (per-session-key, outside any
  // runtime) so it stays in place across teardown-and-recreate.
  let settleThisCall: () => void = () => {};
  const thisCallSettled = new Promise<void>((resolve) => {
    settleThisCall = resolve;
  });
  const previousBarrier = callBarriers.get(sessionKey) ?? Promise.resolve();
  callBarriers.set(sessionKey, thisCallSettled);
  try {
    await previousBarrier;
  } catch (err) {
    log("previous-call barrier rejected", { sessionKey, err });
  }

  try {
    stream.push({ type: "start", partial: output });

    let runtime = runtimes.get(sessionKey);
    if (runtime?.pendingInterrupt) {
      await runtime.pendingInterrupt;
      runtime.pendingInterrupt = undefined;
    }
    const newSignatures = computeSignatures(context.messages);
    const staticPrefix = runtime
      ? runtime.staticPrefix
      : buildStaticPrefix(model, context, options);

    let decision: TurnDecision;
    if (runtime?.wasInterrupted) {
      runtime.wasInterrupted = false;
      let forkAtPiIdx = -1;
      for (let i = context.messages.length - 1; i >= 0; i--) {
        if ((context.messages[i] as any)?.role === "assistant") {
          forkAtPiIdx = i;
          break;
        }
      }
      const forkAtUuid =
        forkAtPiIdx >= 0
          ? runtime.sdkUuidByPiIndex.get(forkAtPiIdx)
          : undefined;
      decision = forkAtUuid
        ? { kind: "fork", forkAtPiIdx, forkAtUuid }
        : decideTurnAction(runtime, newSignatures, context.messages);
    } else if (!runtime) {
      decision = await decideInitialAction(sessionKey, newSignatures);
    } else {
      decision = decideTurnAction(runtime, newSignatures, context.messages);
    }
    lastDecisionInfo.set(
      sessionKey,
      decision.kind === "cold-seed"
        ? { kind: "cold-seed", reason: decision.reason }
        : decision.kind === "warm-resume"
          ? {
              kind: "warm-resume",
              sdkSessionId: decision.sdkSessionId,
            }
          : { kind: decision.kind },
    );

    log("runStreamCall: decision", {
      sessionKey,
      kind: decision.kind,
      reason: (decision as any).reason,
      turnFinalized: turn.finalized,
    });
    runtime = await applyDecision({
      runtime,
      decision,
      sessionKey,
      model,
      context,
      staticPrefix,
      options,
    });

    // Attach our turn so further drainer events (and any queued tool
    // call drainage) target it.
    runtime.activeTurn = turn;
    log("runStreamCall: activeTurn assigned", {
      sessionKey,
      turnFinalized: turn.finalized,
      pendingTools: runtime.pendingToolCalls.size,
      queuedTools: runtime.toolCallQueue.length,
    });

    // If a queued tool call exists from a multi-tool-call SDK turn and pi
    // just resolved enough to clear in-flight calls, surface the next
    // queued call now as a synthetic toolUse turn — without driving the
    // SDK at all.
    if (
      !turn.finalized &&
      runtime.pendingToolCalls.size === 0 &&
      runtime.toolCallQueue.length > 0
    ) {
      const next = runtime.toolCallQueue.shift()!;
      surfaceToolCall(runtime, next);
    }

    await turn.done.promise;

    if (!runtime.isShutdown) {
      runtime.lastSignatures = newSignatures.concat([
        piMessageSignature({
          role: "assistant",
          timestamp: output.timestamp,
          content: output.content,
        }),
      ]);
      await refreshSdkUuidMap(runtime, context.messages, output);
    }
  } catch (err) {
    if (!turn.finalized) {
      output.stopReason = "error";
      output.errorMessage = err instanceof Error ? err.message : String(err);
      turn.finalized = true;
      const rt = runtimes.get(sessionKey);
      if (rt) rt.lastFinalizeReason = "error";
      stream.push({ type: "error", reason: "error", error: output });
      stream.end();
      turn.done.resolve();
    }
  } finally {
    if (options?.signal) options.signal.removeEventListener("abort", onAbort);
    const rt = runtimes.get(sessionKey);
    if (rt && rt.activeTurn === turn) rt.activeTurn = undefined;
    settleThisCall();
  }
}

async function refreshSdkUuidMap(
  runtime: SessionRuntime,
  piMessagesAtCallStart: any[],
  output: AssistantMessage,
): Promise<void> {
  if (!runtime.sdkSessionId) return;
  const projectedAssistant = {
    role: "assistant" as const,
    timestamp: output.timestamp,
    content: output.content,
  };
  const projectedPiMessages = [...piMessagesAtCallStart, projectedAssistant];
  try {
    const sdkMsgs = await getSessionMessages(runtime.sdkSessionId);
    runtime.sdkUuidByPiIndex = buildPiIndexToSdkUuid(
      projectedPiMessages,
      sdkMsgs as any,
    );
  } catch (err) {
    log("getSessionMessages failed", { sessionKey: runtime.sessionKey, err });
    // keep the existing map; fork capability degrades but linear works.
  }
}

function makeOutput(model: Model<any>): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

function buildStaticPrefix(
  model: Model<any>,
  context: Context,
  options: SimpleStreamOptions | undefined,
): StaticPrefix {
  const cwd = (options as { cwd?: string } | undefined)?.cwd ?? process.cwd();
  const providerSettings = loadProviderSettings();
  const appendSystemPrompt = providerSettings.appendSystemPrompt !== false;
  const agentsAppend = appendSystemPrompt ? extractAgentsAppend() : undefined;
  const skillsAppend = appendSystemPrompt
    ? extractSkillsAppend(context.systemPrompt)
    : undefined;
  const appendParts = [agentsAppend, skillsAppend].filter((p): p is string =>
    Boolean(p),
  );
  const systemPromptAppend =
    appendParts.length > 0 ? appendParts.join("\n\n") : undefined;
  const settingSources =
    providerSettings.settingSources ??
    (appendSystemPrompt ? undefined : ["user", "project"]);
  const strictMcpConfig =
    providerSettings.strictMcpConfig ?? !appendSystemPrompt;
  const allowSkillAliasRewrite = Boolean(skillsAppend);
  return {
    systemPromptAppend,
    cwd,
    modelId: model.id,
    settingSources,
    strictMcpConfig,
    allowSkillAliasRewrite,
  };
}

// ---------------------------------------------------------------------------
// Decision application
// ---------------------------------------------------------------------------

async function applyDecision(args: {
  runtime: SessionRuntime | undefined;
  decision: TurnDecision;
  sessionKey: string;
  model: Model<any>;
  context: Context;
  staticPrefix: StaticPrefix;
  options: SimpleStreamOptions | undefined;
}): Promise<SessionRuntime> {
  const { decision, sessionKey, model, context, staticPrefix, options } = args;
  const runtimeCommon = {
    sessionKey,
    model,
    tools: context.tools ?? [],
    staticPrefix,
    reasoning: options?.reasoning,
    thinkingBudgets: options?.thinkingBudgets,
  };
  let runtime = args.runtime;

  if (decision.kind === "cold-seed") {
    seedNotifier?.({
      sessionKey,
      kind: "cold-seed",
      reason: decision.reason,
    });
    if (runtime) await shutdownRuntime(runtime, false);
    const synthetic = await buildSyntheticSession(context);
    if (synthetic) {
      return createRuntime({
        syntheticSession: { store: synthetic.store, id: synthetic.sessionId },
        seedMessages: synthetic.tail,
        ...runtimeCommon,
      });
    }
    return createRuntime({
      seedMessages: buildColdSeedMessages(context),
      ...runtimeCommon,
    });
  }

  if (decision.kind === "warm-resume") {
    seedNotifier?.({
      sessionKey,
      kind: "warm-resume",
      sdkSessionId: decision.sdkSessionId,
    });
    if (runtime) await shutdownRuntime(runtime, false);
    const tail = buildForkTail(
      context.messages,
      decision.tailStartPiIdx - 1,
    );
    if (tail.length === 0) {
      // No new pi messages past the high-water-mark. Cold-seed: a turn
      // with an empty input queue would hang.
      seedNotifier?.({
        sessionKey,
        kind: "cold-seed",
        reason: "empty-tail",
      });
      lastDecisionInfo.set(sessionKey, {
        kind: "cold-seed",
        reason: "empty-tail",
      });
      const synthetic = await buildSyntheticSession(context);
      if (synthetic) {
        return createRuntime({
          syntheticSession: {
            store: synthetic.store,
            id: synthetic.sessionId,
          },
          seedMessages: synthetic.tail,
          ...runtimeCommon,
        });
      }
      return createRuntime({
        seedMessages: buildColdSeedMessages(context),
        ...runtimeCommon,
      });
    }
    return createRuntime({
      resumeSessionId: decision.sdkSessionId,
      seedMessages: tail,
      preSeededUuidMap: decision.sdkUuidByPiIndex,
      ...runtimeCommon,
    });
  }

  if (decision.kind === "fork") {
    const forked = await tryFork(runtime!, decision.forkAtUuid);
    if (!forked) {
      seedNotifier?.({
        sessionKey,
        kind: "cold-seed",
        reason: "unknown-fork-uuid",
      });
      lastDecisionInfo.set(sessionKey, {
        kind: "cold-seed",
        reason: "unknown-fork-uuid",
      });
      await shutdownRuntime(runtime!, false);
      const syntheticFork = await buildSyntheticSession(context);
      if (syntheticFork) {
        return createRuntime({
          syntheticSession: {
            store: syntheticFork.store,
            id: syntheticFork.sessionId,
          },
          seedMessages: syntheticFork.tail,
          ...runtimeCommon,
        });
      }
      return createRuntime({
        seedMessages: buildColdSeedMessages(context),
        ...runtimeCommon,
      });
    }
    const tailMessages = buildForkTail(context.messages, decision.forkAtPiIdx);
    await shutdownRuntime(runtime!, false);
    return createRuntime({
      resumeSessionId: forked.sdkSessionId,
      seedMessages: tailMessages,
      ...runtimeCommon,
    });
  }

  if (decision.kind === "resolve-tool") {
    runtime = runtime!;
    for (const tr of decision.toolResults) {
      const pending = runtime.pendingToolCalls.get(tr.toolCallId);
      if (!pending) {
        // Pi sent a toolResult whose toolCallId doesn't match any
        // parked MCP handler. The SDK subprocess is wedged awaiting
        // tool_result for the id it actually emitted, so silently
        // skipping would hang turn.done.promise forever. Tear the
        // runtime down and fail the turn loudly — pi sees a
        // recoverable error and the next call cold-seeds fresh.
        const msg =
          `claude-agent-sdk: toolResult for unknown toolCallId=${tr.toolCallId}. ` +
          `pending=[${[...runtime.pendingToolCalls.keys()].join(",")}] ` +
          `queued=[${runtime.toolCallQueue.map((c) => c.toolUseId).join(",")}]`;
        await shutdownRuntime(runtime, false);
        throw new Error(msg);
      }
      runtime.pendingToolCalls.delete(tr.toolCallId);
      pending.output.resolve({ text: tr.text, isError: tr.isError });
    }
    // If pi included a fresh user message alongside the tool result, push
    // it onto the input queue so it lands once the SDK is past the tool
    // resolution.
    for (const msg of decision.followUpUserMessages) {
      runtime.inputQueue.push(msg);
    }
    return runtime;
  }

  // linear-extension
  runtime = runtime!;
  for (const msg of decision.userMessages) {
    runtime.inputQueue.push(msg);
  }
  return runtime;
}

/**
 * First-call decision after process start: try a warm-resume from a
 * sidecar persisted by the previous process. Loads the sidecar and
 * verifies the SDK JSONL still exists; tryWarmResume validates the
 * prefix-of-signatures contract.
 */
async function decideInitialAction(
  sessionKey: string,
  newSigs: string[],
): Promise<TurnDecision> {
  const piFile = piSessionFiles.get(sessionKey);
  const path = sidecarPathFor(piFile);
  if (!path) return { kind: "cold-seed", reason: "no-sidecar" };
  let sidecar: SidecarV1 | undefined;
  try {
    sidecar = await loadSidecar(path);
  } catch (err) {
    log("loadSidecar failed", { sessionKey, err });
    return { kind: "cold-seed", reason: "no-sidecar" };
  }
  if (!sidecar) return { kind: "cold-seed", reason: "no-sidecar" };
  let sdkJsonlExists = false;
  try {
    const info = await getSessionInfo(sidecar.sdkSessionId);
    sdkJsonlExists = info != null;
  } catch (err) {
    log("getSessionInfo failed", { sessionKey, err });
  }
  return tryWarmResume({ sidecar, sdkJsonlExists, newSigs });
}

/**
 * Build a sidecar payload from a runtime that's about to be torn down.
 * Returns undefined if the runtime has no SDK session yet (e.g. cold-seed
 * setup failed) or no completed turns to anchor the prefix check.
 */
export function buildSidecarFromRuntime(
  runtime: SessionRuntime,
): SidecarV1 | undefined {
  if (!runtime.sdkSessionId) return undefined;
  if (runtime.lastSignatures.length === 0) return undefined;
  const uuidEntries: Array<[number, string]> = [
    ...runtime.sdkUuidByPiIndex.entries(),
  ];
  const out: SidecarV1 = {
    version: 1,
    sdkSessionId: runtime.sdkSessionId,
    signatures: runtime.lastSignatures.slice(),
  };
  if (uuidEntries.length > 0) out.sdkUuidByPiIndex = uuidEntries;
  return out;
}

/**
 * Persist sidecar for this runtime if there's enough state to make
 * warm-resume viable. Called from the session_shutdown handler before
 * shutdownRuntime so we read live runtime fields before teardown.
 */
export async function persistSidecarForShutdown(
  runtime: SessionRuntime,
  piSessionFile: string | undefined,
): Promise<void> {
  const path = sidecarPathFor(piSessionFile);
  if (!path) return;
  const sidecar = buildSidecarFromRuntime(runtime);
  if (!sidecar) return;
  try {
    await saveSidecar(path, sidecar);
  } catch (err) {
    log("saveSidecar failed", { err });
  }
}

async function tryFork(
  runtime: SessionRuntime,
  forkUuid: string,
): Promise<{ sdkSessionId: string } | undefined> {
  if (!runtime.sdkSessionId) return undefined;
  try {
    const fork = await forkSession(runtime.sdkSessionId, {
      upToMessageId: forkUuid,
    });
    return { sdkSessionId: fork.sessionId };
  } catch (err) {
    log("forkSession failed", { sessionKey: runtime.sessionKey, err });
    return undefined;
  }
}
