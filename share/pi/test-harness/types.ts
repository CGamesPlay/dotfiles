import type { AgentSessionEvent } from "@mariozechner/pi-coding-agent";
import type { AgentMessage } from "@mariozechner/pi-agent-core";

export interface PlaybookAction {
  type: "call" | "say";
  toolName?: string;
  params?: Record<string, unknown> | (() => Record<string, unknown>);
  text?: string;
  thenCallback?: (result: ToolResultRecord) => void;
}

export interface ToolResult {
  content: Array<{ type: string; text: string }>;
  details?: unknown;
  isError?: boolean;
}

export type MockToolHandler =
  | string
  | ToolResult
  | ((params: Record<string, unknown>) => string | ToolResult);

export interface MockUIConfig {
  confirm?: boolean | ((title: string, message: string) => boolean);
  select?:
    | number
    | string
    | ((title: string, items: string[]) => string | undefined);
  input?:
    | string
    | ((title: string, placeholder?: string) => string | undefined);
  editor?: string | ((title: string, prefilled?: string) => string | undefined);
}

export interface ToolCallRecord {
  step: number;
  toolName: string;
  input: Record<string, unknown>;
  blocked: boolean;
  blockReason?: string;
}

export interface ToolResultRecord {
  step: number;
  toolName: string;
  toolCallId: string;
  text: string;
  content: Array<{ type: string; text?: string }>;
  isError: boolean;
  details?: unknown;
  mocked: boolean;
}

export interface UICallRecord {
  method: string;
  args: unknown[];
  returnValue?: unknown;
}

export interface ExtensionErrorRecord {
  event: string;
  error: string;
  stack?: string;
}

export interface TestEvents {
  all: AgentSessionEvent[];
  toolCalls: ToolCallRecord[];
  toolResults: ToolResultRecord[];
  messages: AgentMessage[];
  ui: UICallRecord[];
  extensionErrors: ExtensionErrorRecord[];

  toolCallsFor(name: string): ToolCallRecord[];
  toolResultsFor(name: string): ToolResultRecord[];
  blockedCalls(): ToolCallRecord[];
  uiCallsFor(method: string): UICallRecord[];
  toolSequence(): string[];
}

export interface TestSessionOptions {
  extensions?: string[];
  extensionFactories?: Array<(pi: any) => void>;
  cwd?: string;
  systemPrompt?: string;
  mockTools?: Record<string, MockToolHandler>;
  mockUI?: MockUIConfig;
  propagateErrors?: boolean;
  /** Called each time the playbook streamFn is invoked, receiving the full
   *  LLM context (systemPrompt, messages, tools, etc.). Use to assert on
   *  prompt modifications made by extension hooks. */
  onStreamFnCall?: (context: any) => void;
}
