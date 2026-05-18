import { getModels } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import {
  __shutdownAllRuntimesForTesting,
  clearPiSessionFile,
  getLastDecisionInfo,
  getRuntime,
  persistSidecarForShutdown,
  setPiSessionFile,
  setSeedNotifier,
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

export function __getLastDecisionInfoForTesting(sessionId: string) {
  return getLastDecisionInfo(sessionId);
}

/**
 * Test helper: associate a pi session file path with a sessionId. Real
 * pi wires this from the `session_start` event handler; tests must call
 * it explicitly before invoking streamSimple if they want warm-resume
 * to find a sidecar.
 */
export function __setPiSessionFileForTesting(
  sessionId: string,
  file: string,
): void {
  setPiSessionFile(sessionId, file);
}

/**
 * Test helper: simulate the session_shutdown event for a single session
 * (persist sidecar, then tear down the runtime without deleting the SDK
 * JSONL). Real pi does this via the `session_shutdown` event handler;
 * tests must call this explicitly to validate the warm-resume round-trip.
 */
export async function __simulateShutdownForTesting(
  sessionId: string,
  piSessionFile: string,
): Promise<void> {
  const runtime = getRuntime(sessionId);
  if (!runtime) return;
  await persistSidecarForShutdown(runtime, piSessionFile);
  await shutdownRuntime(runtime, false);
  clearPiSessionFile(sessionId);
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
    setSeedNotifier((notice) => {
      const detail =
        notice.kind === "warm-resume"
          ? `warm-resuming existing SDK session ${notice.sdkSessionId}`
          : `cold-seeding new SDK session (reason: ${notice.reason})`;
      ctx.ui.notify(`[claude-agent-sdk] ${detail}`, "info");
    });
    const sm = ctx?.sessionManager;
    const sessionId = sm?.getSessionId?.();
    const sessionFile = sm?.getSessionFile?.();
    if (sessionId && sessionFile) setPiSessionFile(sessionId, sessionFile);
  });

  pi.registerCommand("debug-claude-agent-sdk", {
    description: "Print debugging information about the claude-agent-sdk state",
    handler: async (_args, ctx) => {
      const sm = ctx.sessionManager;
      const sessionId = sm.getSessionId();
      const runtime = getRuntime(sessionId);
      const entries = sm.getEntries();
      const messageEntries = entries.filter((e) => e.type === "message");
      const lastDecision = getLastDecisionInfo(sessionId);

      const lines: string[] = [
        `pi session name: ${sm.getSessionName() ?? "(none)"}`,
        `pi session id: ${sessionId}`,
        `pi session file: ${sm.getSessionFile() ?? "(none)"}`,
        `pi leaf entry id: ${sm.getLeafId() ?? "(none)"}`,
        `pi entries: ${entries.length} total, ${messageEntries.length} messages`,
        `sdk session id: ${runtime?.sdkSessionId ?? "(no runtime)"}`,
        `last decision: ${
          lastDecision
            ? lastDecision.kind === "cold-seed"
              ? `cold-seed (${lastDecision.reason})`
              : lastDecision.kind === "warm-resume"
                ? `warm-resume (${lastDecision.sdkSessionId})`
                : lastDecision.kind
            : "(none)"
        }`,
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
    const piSessionFile = ctx?.sessionManager?.getSessionFile?.();
    if (runtime) {
      // Save sidecar BEFORE shutdown so we can read live runtime fields.
      // We never delete the SDK JSONL on shutdown — it's needed for the
      // next process to warm-resume. Cleanup is handled out of band.
      await persistSidecarForShutdown(runtime, piSessionFile);
      await shutdownRuntime(runtime, false);
    }
    clearPiSessionFile(sessionId);
  });

  pi.registerProvider(PROVIDER_ID, {
    baseUrl: "claude-agent-sdk",
    apiKey: "ANTHROPIC_API_KEY",
    api: "claude-agent-sdk",
    models: MODELS,
    streamSimple: streamClaudeAgentSdk,
  });
}
