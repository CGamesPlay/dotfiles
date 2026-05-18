import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type {
  ExtensionErrorRecord,
  TestEvents,
  ToolCallRecord,
  ToolResultRecord,
  UICallRecord,
} from "./types.js";

export function createEventCollector(): TestEvents {
  const all: AgentSessionEvent[] = [];
  const toolCalls: ToolCallRecord[] = [];
  const toolResults: ToolResultRecord[] = [];
  const messages: AgentMessage[] = [];
  const ui: UICallRecord[] = [];
  const extensionErrors: ExtensionErrorRecord[] = [];

  return {
    all,
    toolCalls,
    toolResults,
    messages,
    ui,
    extensionErrors,

    toolCallsFor(name) {
      return toolCalls.filter((tc) => tc.toolName === name);
    },
    toolResultsFor(name) {
      return toolResults.filter((tr) => tr.toolName === name);
    },
    blockedCalls() {
      return toolCalls.filter((tc) => tc.blocked);
    },
    uiCallsFor(method) {
      return ui.filter((u) => u.method === method);
    },
    toolSequence() {
      return toolCalls.map((tc) => tc.toolName);
    },
  };
}
