/**
 * Agent Lifecycle Handlers
 *
 * Handles agent_start, agent_end, before_agent_start, and turn_start events.
 * Coordinates elapsed timer, plan workflow, notification, todo reminders,
 * system prompt modification, and checkpoint creation.
 */

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import path from "node:path";
import { createCheckpoint } from "../lib/checkpoint-core.js";
import { autoNameSessionFromPlan, getPlanFile } from "../tools/planning.js";
import {
  getCachedRepoRoot,
  addToCache,
  getSessionIdFromFile,
} from "./session.js";
import { detectExternalModifications } from "../lib/session-storage.js";
import { planModePrompt } from "../lib/prompts.js";
import {
  recomputeDiffStatus,
  refreshDiffStatusWidget,
} from "../lib/diff-status.js";
import { syncTodoStateFromStorage, refreshTodoWidget } from "../tools/todo.js";
import type { AppState } from "../state.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPrompt = readFileSync(
  path.join(__dirname, "..", "prompt.md"),
  "utf-8",
);

// ─── Helpers ───────────────────────────────────────────────────────────────────

// ─── Exported Handlers ─────────────────────────────────────────────────────────

export async function onAgentEnd(
  state: AppState,
  pi: ExtensionAPI,
  _event: any,
  ctx: ExtensionContext,
) {
  autoNameSessionFromPlan(state, pi, ctx);
}

export async function onBeforeAgentStart(
  state: AppState,
  pi: ExtensionAPI,
  event: any,
  ctx: ExtensionContext,
) {
  let systemPrompt = event.systemPrompt;
  let message: any = undefined;

  // 1. Detect external modifications to session storage
  await detectExternalModifications(state, pi, ctx);

  // 2. Customize the system prompt
  systemPrompt += `\n\n${extensionPrompt}\n\nCurrent value of $PI_SESSION_STORAGE: ${state.sessionStorage.dir}`;

  // 3. Inject plan mode instructions once when /plan kicks off the turn.
  //    The agent carries them forward in conversation history; re-injecting
  //    on every subsequent turn would waste context.
  if (state.plan.pendingPlanModeMessage && !message) {
    state.plan.pendingPlanModeMessage = false;
    const planFile = getPlanFile();
    message = {
      customType: "plan-mode",
      content: planModePrompt(planFile),
      display: true,
    };
  }

  return { systemPrompt, message };
}

export async function onTurnEnd(
  state: AppState,
  pi: ExtensionAPI,
  _event: any,
  ctx: ExtensionContext,
) {
  // Detect external modifications to session storage
  await detectExternalModifications(state, pi, ctx);

  // Sync todo state from storage (agent may have written TODO.md)
  syncTodoStateFromStorage(state);
  refreshTodoWidget(state, ctx);

  // Recompute the changes-vs-baseline status widget.
  if (state.checkpoint.gitAvailable) {
    const root = await getCachedRepoRoot(ctx.cwd);
    await recomputeDiffStatus(state, root);
    refreshDiffStatusWidget(state, ctx);
  }
}

export async function onTurnStart(
  state: AppState,
  event: any,
  ctx: ExtensionContext,
) {
  // Create checkpoint (with pending-restore guard)
  if (!state.checkpoint.gitAvailable || state.checkpoint.checkpointingFailed)
    return;

  if (
    !state.checkpoint.currentSessionId &&
    state.checkpoint.currentSessionFile
  ) {
    state.checkpoint.currentSessionId = await getSessionIdFromFile(
      state.checkpoint.currentSessionFile,
    );
  }
  if (!state.checkpoint.currentSessionId) return;

  state.checkpoint.pendingCheckpoint = (async () => {
    try {
      const root = await getCachedRepoRoot(ctx.cwd);
      const id = `${state.checkpoint.currentSessionId}-turn-${event.turnIndex}-${event.timestamp}`;
      const cp = await createCheckpoint(
        root,
        id,
        event.turnIndex,
        state.checkpoint.currentSessionId,
      );
      addToCache(state, cp);

      // If session-load found no prior checkpoint, this one becomes the
      // baseline for the diff-status widget.
      if (state.checkpoint.baselineTreeSha === null) {
        state.checkpoint.baselineTreeSha = cp.worktreeTreeSha;
      }
    } catch {
      state.checkpoint.checkpointingFailed = true;
    }
  })();
}
