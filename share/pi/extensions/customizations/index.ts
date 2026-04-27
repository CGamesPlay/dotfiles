/**
 * Customizations Extension — Entry Point
 *
 * Single registration function wiring all hooks, tools, commands, and flags.
 * This is the event surface map — every hook, tool, command, and flag at a glance.
 * No business logic here, only wiring.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createAppState } from "./state.js";

// Hooks
import {
  onSessionStart,
  onSessionTree,
  onSessionBeforeFork,
  onSessionBeforeTree,
  onSessionShutdown,
} from "./hooks/session.js";
import {
  onAgentEnd,
  onBeforeAgentStart,
  onTurnStart,
  onTurnEnd,
} from "./hooks/agent.js";
import { onToolCall, onToolResult, onUserBash } from "./hooks/tool-events.js";

// Tools & Commands
import { registerTodoCommands } from "./tools/todo.js";
import {
  registerPlanningTools,
  registerPlanningCommands,
} from "./tools/planning.js";
import {
  registerSystemAssistantFlags,
  registerSystemAssistantTools,
  registerSystemAssistantCommands,
} from "./tools/system-assistant.js";

export default function (pi: ExtensionAPI) {
  const state = createAppState();

  // ── Hooks ──────────────────────────────────────────────
  // Session lifecycle
  // Note: session_switch and session_fork events were removed in pi v0.65.0
  // Use onSessionStart with event.reason === "fork" or event.reason === "resume"/"new"
  pi.on("session_start", (e, ctx) => onSessionStart(state, pi, e, ctx));
  pi.on("session_tree", (e, ctx) => onSessionTree(state, pi, e, ctx));
  pi.on("session_before_fork", (e, ctx) => onSessionBeforeFork(state, e, ctx));
  pi.on("session_before_tree", (e, ctx) => onSessionBeforeTree(state, e, ctx));
  pi.on("session_shutdown", (e, ctx) => onSessionShutdown(state, e, ctx));

  // Agent lifecycle
  pi.on("agent_end", (e, ctx) => onAgentEnd(state, pi, e, ctx));
  pi.on("before_agent_start", (e, ctx) =>
    onBeforeAgentStart(state, pi, e, ctx),
  );
  pi.on("turn_start", (e, ctx) => onTurnStart(state, e, ctx));
  pi.on("turn_end", (e, ctx) => onTurnEnd(state, pi, e, ctx));

  // Tool interception
  pi.on("tool_call", (e, ctx) => onToolCall(state, pi, e, ctx));
  pi.on("tool_result", (e, ctx) => onToolResult(state, pi, e, ctx));
  pi.on("user_bash", (e, ctx) => onUserBash(pi, e, ctx));

  // ── Tools ──────────────────────────────────────────────
  registerPlanningTools(state, pi);
  registerSystemAssistantTools(state, pi);

  // ── Commands ───────────────────────────────────────────
  registerTodoCommands(state, pi);
  registerPlanningCommands(state, pi);
  registerSystemAssistantCommands(state, pi);

  // ── Flags ──────────────────────────────────────────────
  registerSystemAssistantFlags(pi);
}
