import { getModels } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import {
  __shutdownAllRuntimesForTesting,
  getRuntime,
  setColdSeedNotifier,
  shutdownRuntime,
  streamClaudeAgentSdk,
} from "./src/runtime.js";

const PROVIDER_ID = "claude-agent-sdk";

const MODELS = getModels("anthropic").map((model) => ({
  id: model.id,
  name: model.name,
  reasoning: model.reasoning,
  input: model.input,
  cost: model.cost,
  contextWindow: model.contextWindow,
  maxTokens: model.maxTokens,
}));

// =====================================================================
// Test-only introspection
//
// Exposes the in-memory runtime so tests can assert that resume actually
// happened (same SDK session reused across turns) rather than relying
// solely on cache numbers — the prompt cache hits on prefix bytes
// regardless of SDK session identity, so cache thresholds alone can't
// distinguish "resume working" from "every turn cold-seeds with the
// same prefix".
// =====================================================================

export function __getBridgeStateForTesting(
  sessionId: string,
): { sdkSessionId: string } | undefined {
  const runtime = getRuntime(sessionId);
  if (!runtime || !runtime.sdkSessionId) return undefined;
  return { sdkSessionId: runtime.sdkSessionId };
}

export function __getCreatedSdkSessionIdsForTesting(
  sessionId: string,
): string[] {
  const runtime = getRuntime(sessionId);
  if (!runtime) return [];
  return [...runtime.createdSdkSessionIds];
}

/**
 * Tear down every active runtime. Tests must call this in `afterEach` to
 * release SDK subprocesses and stop drainer loops — without it the test
 * runner never exits (open handles hold the event loop alive) and later
 * tests run under resource pressure from prior tests' leaked runtimes.
 */
export const __shutdownAllForTesting = __shutdownAllRuntimesForTesting;

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    setColdSeedNotifier((_sessionKey) => {
      ctx.ui.notify(`[claude-agent-sdk] cold-seeding new SDK session`, "info");
    });
  });

  pi.registerCommand("debug-claude-agent-sdk", {
    description: "Print debugging information about the claude-agent-sdk state",
    handler: async (_args, ctx) => {
      const sm = ctx.sessionManager;
      const sessionId = sm.getSessionId();
      const runtime = getRuntime(sessionId);
      const entries = sm.getEntries();
      const messageEntries = entries.filter((e) => e.type === "message");

      const lines: string[] = [
        `pi session name: ${sm.getSessionName() ?? "(none)"}`,
        `pi session id: ${sessionId}`,
        `pi session file: ${sm.getSessionFile() ?? "(none)"}`,
        `pi leaf entry id: ${sm.getLeafId() ?? "(none)"}`,
        `pi entries: ${entries.length} total, ${messageEntries.length} messages`,
        `sdk session id: ${runtime?.sdkSessionId ?? "(no runtime)"}`,
      ];

      if (runtime?.sdkUuidByPiIndex.size) {
        const pairs = [...runtime.sdkUuidByPiIndex.entries()]
          .sort((a, b) => a[0] - b[0])
          .slice(-5);
        lines.push(`sdk uuid map (last ${pairs.length}):`);
        for (const [piIdx, sdkUuid] of pairs) {
          lines.push(`  pi[${piIdx}] → ${sdkUuid}`);
        }
      }

      ctx.ui.notify(lines.join("\n"));
    },
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    const sessionId = ctx?.sessionManager?.getSessionId?.();
    if (!sessionId) return;
    const runtime = getRuntime(sessionId);
    if (!runtime) return;
    await shutdownRuntime(runtime, true);
  });

  pi.registerProvider(PROVIDER_ID, {
    baseUrl: "claude-agent-sdk",
    apiKey: "ANTHROPIC_API_KEY",
    api: "claude-agent-sdk",
    models: MODELS,
    streamSimple: streamClaudeAgentSdk,
  });
}
