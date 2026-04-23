import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Context,
  type Model,
  type SimpleStreamOptions,
} from "@mariozechner/pi-ai";
import type { PlaybookAction, ToolResultRecord } from "./types.js";

export class CallAction {
  readonly action: PlaybookAction;

  constructor(
    toolName: string,
    params: Record<string, unknown> | (() => Record<string, unknown>),
  ) {
    this.action = { type: "call", toolName, params };
  }

  then(callback: (result: ToolResultRecord) => void): CallAction {
    this.action.thenCallback = callback;
    return this;
  }
}

export function calls(
  toolName: string,
  params: Record<string, unknown> | (() => Record<string, unknown>) = {},
): CallAction {
  return new CallAction(toolName, params);
}

export function says(text: string): PlaybookAction {
  return { type: "say", text };
}

function resolveParams(
  params: Record<string, unknown> | (() => Record<string, unknown>) | undefined,
): Record<string, unknown> {
  if (!params) return {};
  if (typeof params === "function") return params();
  return params;
}

function buildAssistantMessage(
  action: PlaybookAction,
  toolCallCounter: number,
): AssistantMessage {
  const content: AssistantMessage["content"] = [];

  if (action.type === "say") {
    content.push({ type: "text", text: action.text ?? "" });
  } else {
    const resolved = resolveParams(action.params);
    content.push({
      type: "toolCall",
      id: `playbook-tc-${toolCallCounter}`,
      name: action.toolName!,
      arguments: resolved,
    });
  }

  return {
    role: "assistant",
    content,
    api: "openai-responses",
    provider: "test",
    model: "playbook",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    },
    stopReason: action.type === "call" ? "toolUse" : "stop",
    timestamp: Date.now(),
  };
}

export interface TurnState {
  consumed: number;
  remaining: number;
  consumedActions: PlaybookAction[];
  pendingCallbacks: Map<string, (result: ToolResultRecord) => void>;
  exhausted: boolean;
}

export type PlaybookStreamFn = (
  model: Model<any>,
  context: Context,
  options?: SimpleStreamOptions,
) => AssistantMessageEventStream;

/** Build a streamFn that consumes a single turn's actions. The caller passes
 *  a counter ref shared across turns so tool call IDs are globally unique —
 *  pi's session store keys tool calls by id and duplicates silently clobber. */
export function createTurnStreamFn(
  actions: PlaybookAction[],
  toolCallCounterRef: { value: number },
): {
  streamFn: PlaybookStreamFn;
  state: TurnState;
} {
  const queue = [...actions];
  const state: TurnState = {
    consumed: 0,
    remaining: queue.length,
    consumedActions: [],
    pendingCallbacks: new Map(),
    exhausted: false,
  };

  const streamFn: PlaybookStreamFn = () => {
    const stream = createAssistantMessageEventStream();
    const action = queue.shift();

    if (!action) {
      // Queue empty but the agent kept looping — emit a stop so it unwinds;
      // the harness will fail the turn after the agent idles.
      state.exhausted = true;
      const fallback: AssistantMessage = {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "[playbook exhausted — missing says() at end of turn]",
          },
        ],
        api: "openai-responses",
        provider: "test",
        model: "playbook",
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            total: 0,
          },
        },
        stopReason: "stop",
        timestamp: Date.now(),
      };
      queueMicrotask(() => {
        stream.push({ type: "done", reason: "stop", message: fallback });
      });
      return stream;
    }

    state.consumed++;
    state.remaining = queue.length;
    state.consumedActions.push(action);

    if (action.type === "call") toolCallCounterRef.value++;
    const message = buildAssistantMessage(action, toolCallCounterRef.value);

    if (action.type === "call" && action.thenCallback) {
      const tcContent = message.content.find((c) => c.type === "toolCall") as
        | { id: string }
        | undefined;
      const tcId = tcContent?.id ?? action.toolName!;
      state.pendingCallbacks.set(tcId, action.thenCallback);
    }

    queueMicrotask(() => {
      stream.push({
        type: "done",
        reason: message.stopReason === "toolUse" ? "toolUse" : "stop",
        message,
      });
    });

    return stream;
  };

  return { streamFn, state };
}

export function formatRemainingActions(state: TurnState): string {
  if (state.remaining === 0 && !state.exhausted) return "";
  const lines: string[] = [];
  if (state.exhausted) {
    lines.push(
      `Playbook exhausted mid-turn after ${state.consumed} action(s) — the agent kept looping past the last scripted action. Add a says() at the end of the turn.`,
    );
  }
  if (state.remaining > 0) {
    lines.push(
      `${state.remaining} scripted action(s) left unconsumed — the agent ended the turn early.`,
    );
  }
  return lines.join("\n");
}
