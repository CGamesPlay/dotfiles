import type {
  AssistantMessage,
  AssistantMessageEventStream,
} from "@mariozechner/pi-ai";
import type { SettingSource } from "@anthropic-ai/claude-agent-sdk";

/**
 * Static, byte-stable prefix snapshot for a session. Captured on first
 * streamSimple call and reused unchanged for the lifetime of the session so
 * Anthropic's prompt cache key (which is a hash over prefix bytes) hits.
 */
export type StaticPrefix = {
  systemPromptAppend?: string;
  cwd: string;
  modelId: string;
  settingSources?: SettingSource[];
  strictMcpConfig: boolean;
  /**
   * Whether path arguments should be rewritten from the user-facing skill
   * aliases (~/.claude/skills, .claude/skills) back into pi's own paths.
   * Captured at session start; matches the systemPromptAppend.
   */
  allowSkillAliasRewrite: boolean;
};

/**
 * One pending tool call: the SDK has invoked our MCP handler, the handler is
 * awaiting `output`, and we've surfaced (or queued) the call to pi.
 */
export type PendingToolCall = {
  toolUseId: string;
  piToolName: string;
  args: Record<string, unknown>;
  /**
   * Resolves with the text body pi's tool execution returned. The handler
   * uses this to build the SDK CallToolResult.
   */
  output: PromiseDeferred<{ text: string; isError: boolean }>;
};

export type PromiseDeferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
};

/**
 * Active turn coordination. One of these exists while a streamSimple call is
 * driving an assistant turn through the SDK iterator. The drainer forwards
 * stream events at it; streamSimple awaits `done`.
 */
export type ActiveTurn = {
  stream: AssistantMessageEventStream;
  output: AssistantMessage;
  done: PromiseDeferred<void>;
  /** Once the turn has been resolved, ignore further events for it. */
  finalized: boolean;
};
