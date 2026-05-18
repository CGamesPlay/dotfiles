import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { ExtensionRunner } from "@earendil-works/pi-coding-agent";
import type { MockToolHandler, ToolResult, ToolResultRecord } from "./types.js";
import type { TurnState } from "./playbook.js";

export class ToolBlockedError extends Error {
  readonly toolBlocked = true as const;

  constructor(reason: string) {
    super(reason);
    this.name = "ToolBlockedError";
  }
}

export function isBlockedError(err: unknown): boolean {
  if (err instanceof ToolBlockedError) return true;
  if (err instanceof Error) {
    const msg = err.message;
    return (
      msg.includes("blocked") ||
      msg.includes("Plan mode") ||
      msg.includes("WRITE operation")
    );
  }
  return false;
}

function normalizeMockResult(
  handler: MockToolHandler,
  params: Record<string, unknown>,
): ToolResult {
  let raw: string | ToolResult;
  if (typeof handler === "string") raw = handler;
  else if (typeof handler === "function") raw = handler(params);
  else raw = handler;

  if (typeof raw === "string") {
    return { content: [{ type: "text", text: raw }], details: {} };
  }
  return raw;
}

const PERMISSIVE_SCHEMA = {
  type: "object" as const,
  additionalProperties: true,
  properties: {},
};

/** Accessor for the live turn state — changes each t.turn() call. */
export interface TurnStateRef {
  current: TurnState | null;
}

export function interceptToolExecution(
  tools: AgentTool[],
  mockTools: Record<string, MockToolHandler>,
  toolResults: ToolResultRecord[],
  turnRef: TurnStateRef,
  propagateErrors: boolean,
  extensionRunner?: ExtensionRunner,
): AgentTool[] {
  return tools.map((tool) => {
    const handler = mockTools[tool.name];
    if (!handler) {
      return wrapForCollection(tool, toolResults, turnRef, propagateErrors);
    }

    return {
      ...tool,
      parameters: PERMISSIVE_SCHEMA as unknown as typeof tool.parameters,
      execute: async (
        toolCallId: string,
        params: Record<string, unknown>,
        _signal?: AbortSignal,
        _onUpdate?: any,
      ) => {
        const state = turnRef.current;
        const step = state?.consumed ?? 0;

        if (extensionRunner?.hasHandlers("tool_call")) {
          const callResult = await extensionRunner.emitToolCall({
            type: "tool_call",
            toolName: tool.name,
            toolCallId,
            input: params,
          } as any);

          if (callResult?.block) {
            const reason =
              callResult.reason || "Tool execution was blocked by an extension";
            const record: ToolResultRecord = {
              step,
              toolName: tool.name,
              toolCallId,
              text: reason,
              content: [{ type: "text", text: reason }],
              isError: true,
              details: undefined,
              mocked: true,
            };
            toolResults.push(record);
            if (state) fireThenCallback(state, toolCallId, record);
            throw new ToolBlockedError(reason);
          }
        }

        const result = normalizeMockResult(handler, params);

        if (extensionRunner?.hasHandlers("tool_result")) {
          const resultHook = await extensionRunner.emitToolResult({
            type: "tool_result",
            toolName: tool.name,
            toolCallId,
            input: params,
            content: result.content,
            details: result.details,
            isError: false,
          } as any);

          if (resultHook) {
            result.content =
              (resultHook.content as typeof result.content) ?? result.content;
            result.details = resultHook.details ?? result.details;
          }
        }

        const text = result.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("\n");

        const record: ToolResultRecord = {
          step,
          toolName: tool.name,
          toolCallId,
          text,
          content: result.content,
          isError: result.isError ?? false,
          details: result.details,
          mocked: true,
        };
        toolResults.push(record);
        if (state) fireThenCallback(state, toolCallId, record);

        return {
          content: result.content,
          details: result.details ?? {},
        };
      },
    } as AgentTool;
  });
}

function wrapForCollection(
  tool: AgentTool,
  toolResults: ToolResultRecord[],
  turnRef: TurnStateRef,
  propagateErrors: boolean,
): AgentTool {
  const originalExecute = tool.execute;

  return {
    ...tool,
    execute: async (
      toolCallId: string,
      params: Record<string, unknown>,
      signal?: AbortSignal,
      onUpdate?: any,
    ) => {
      const state = turnRef.current;
      const step = state?.consumed ?? 0;

      try {
        const result = await originalExecute.call(
          tool,
          toolCallId,
          params,
          signal,
          onUpdate,
        );
        const text = (result.content ?? [])
          .filter((c: any) => c.type === "text")
          .map((c: any) => c.text)
          .join("\n");

        const record: ToolResultRecord = {
          step,
          toolName: tool.name,
          toolCallId,
          text,
          content: result.content ?? [],
          isError: !!(result as any).isError,
          details: result.details,
          mocked: false,
        };
        toolResults.push(record);
        if (state) fireThenCallback(state, toolCallId, record);
        return result;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const blocked = isBlockedError(err);

        const record: ToolResultRecord = {
          step,
          toolName: tool.name,
          toolCallId,
          text: errMsg,
          content: [{ type: "text", text: errMsg }],
          isError: true,
          details: undefined,
          mocked: false,
        };
        toolResults.push(record);
        if (state) fireThenCallback(state, toolCallId, record);

        if (blocked) throw err;
        if (propagateErrors) {
          throw new Error(
            `Tool ${tool.name} threw at step ${step}: ${errMsg}`,
            { cause: err },
          );
        }
        return {
          content: [{ type: "text", text: errMsg }],
          details: {},
          isError: true,
        };
      }
    },
  } as AgentTool;
}

function fireThenCallback(
  state: TurnState,
  toolCallId: string,
  record: ToolResultRecord,
): void {
  const keyById = state.pendingCallbacks.has(toolCallId);
  const key = keyById ? toolCallId : record.toolName;
  const cb = state.pendingCallbacks.get(key);
  if (!cb) return;
  state.pendingCallbacks.delete(key);
  try {
    cb(record);
  } catch (err) {
    console.warn(
      `[pi-test-harness] .then() callback error for ${record.toolName}: ${err}`,
    );
  }
}
