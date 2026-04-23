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
} from "@mariozechner/pi-coding-agent";
import path from "node:path";
import { existsSync } from "node:fs";
import os from "node:os";
import { createCheckpoint } from "../lib/checkpoint-core.js";
import {
  autoNameSessionFromPlan,
  runFinishPlanFlow,
} from "../tools/planning.js";
import { modifySystemPrompt } from "../tools/system-assistant.js";
import {
  getCachedRepoRoot,
  addToCache,
  getSessionIdFromFile,
} from "./session.js";
import { detectExternalModifications } from "../lib/session-storage.js";
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

function getAgentDir(): string {
  const envKeys = ["PI_CODING_AGENT_DIR", "TAU_CODING_AGENT_DIR"];
  for (const k of envKeys) {
    const v = process.env[k];
    if (v) {
      if (v === "~") return os.homedir();
      if (v.startsWith("~/")) return path.join(os.homedir(), v.slice(2));
      return v;
    }
  }
  for (const [k, v] of Object.entries(process.env)) {
    if (k.endsWith("_CODING_AGENT_DIR") && v) return v;
  }
  return path.join(os.homedir(), ".pi", "agent");
}

// ─── Exported Handlers ─────────────────────────────────────────────────────────

export async function onAgentEnd(
  state: AppState,
  pi: ExtensionAPI,
  event: any,
  ctx: ExtensionContext,
) {
  // 1. Auto-name session from plan
  await autoNameSessionFromPlan(state, pi, ctx);

  // 2. Handle finish_plan review flow
  let planFlowEngaged = false;
  if (state.plan.pendingFinishPlan) {
    state.plan.pendingFinishPlan = false;

    if (ctx.hasUI) {
      const agentDir = getAgentDir();
      const sessionId = ctx.sessionManager.getSessionId();
      const planFile = path.join(agentDir, "plans", `${sessionId}.md`);

      if (existsSync(planFile)) {
        planFlowEngaged = true;
        await runFinishPlanFlow(state, pi, agentDir, planFile, ctx);
      }
    }
  }
}

export async function onBeforeAgentStart(
  state: AppState,
  pi: ExtensionAPI,
  event: any,
  ctx: ExtensionContext,
) {
  let systemPrompt = event.systemPrompt;
  let customMessage: any = undefined;

  // 1. Detect external modifications to session storage
  await detectExternalModifications(state, pi, ctx);

  // 2. Customize the system prompt
  systemPrompt += `\n\n${extensionPrompt}\n\nCurrent value of $PI_SESSION_STORAGE: ${state.sessionStorage.dir}`;
  systemPrompt = modifySystemPrompt(pi, systemPrompt) ?? systemPrompt;

  // 3. Decide if we need to generate a guidance message before the turn starts.
  const branch = [...ctx.sessionManager.getBranch()].reverse();
  for (const entry of branch) {
    const msg = (entry as any)?.message;
    if (!msg) continue;

    if (msg.role === "user") {
      break;
    }

    if (msg.role === "toolResult" && msg.toolName === "finish_plan") {
      customMessage = {
        customType: "plan-files-rejected",
        content:
          "The user reviewed the plan and chose not to implement it yet.",
        display: false,
      };
      break;
    }
  }

  return { systemPrompt, customMessage };
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
    } catch {
      state.checkpoint.checkpointingFailed = true;
    }
  })();
}
