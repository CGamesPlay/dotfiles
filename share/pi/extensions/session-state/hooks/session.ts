/**
 * Session Lifecycle Handlers
 *
 * Orchestrates all session-related concerns in a defined order within each handler:
 * checkpoint detection, terminal setup, theme detection, state reconstruction.
 */

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { spawn } from "child_process";
import {
  isGitRepo,
  isSafeId,
  createCheckpoint,
  restoreCheckpoint,
  listCheckpointRefs,
  loadCheckpointFromRef,
  computeCurrentWorktreeTreeSha,
  getDiffStat,
  getRepoRoot,
  type CheckpointData,
} from "../lib/checkpoint-core.js";
import { syncTodoStateFromStorage, refreshTodoWidget } from "../tools/todo.js";
import {
  resyncSessionStorage,
  clearSessionDirContents,
  removeSessionDirIfEmpty,
} from "../lib/session-storage.js";
import {
  loadBaselineTreeSha,
  recomputeDiffStatus,
  refreshDiffStatusWidget,
} from "../lib/diff-status.js";
import type { AppState } from "../state.js";

// ─── Repo Root Cache ───────────────────────────────────────────────────────────

let cachedRepoRoot: string | null = null;
let cachedRepoCwd: string | null = null;

async function getCachedRepoRoot(cwd: string): Promise<string> {
  if (cachedRepoCwd !== cwd) {
    cachedRepoRoot = null;
    cachedRepoCwd = cwd;
  }
  if (!cachedRepoRoot) {
    cachedRepoRoot = await getRepoRoot(cwd);
  }
  return cachedRepoRoot;
}

function resetRepoCache(): void {
  cachedRepoRoot = null;
  cachedRepoCwd = null;
}

// Re-export for use by other hooks
export { getCachedRepoRoot };

// ─── Checkpoint Helpers ────────────────────────────────────────────────────────

function addToCache(state: AppState, cp: CheckpointData): void {
  if (!state.checkpoint.checkpointCache) {
    state.checkpoint.checkpointCache = [];
  }
  if (
    state.checkpoint.checkpointCache.some((existing) => existing.id === cp.id)
  )
    return;
  state.checkpoint.checkpointCache.push(cp);
}

// Re-export for use by other hooks
export { addToCache };

function readFirstLine(filePath: string): Promise<string> {
  return new Promise((resolve) => {
    const proc = spawn("head", ["-1", filePath], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    let data = "";
    proc.stdout.on("data", (chunk: Buffer) => (data += chunk));
    proc.on("close", () => resolve(data.trim()));
    proc.on("error", () => resolve(""));
  });
}

function extractJsonField(line: string, field: string): string | undefined {
  const regex = new RegExp(`"${field}"\\s*:\\s*"([^"]*)"`, "i");
  const match = line.match(regex);
  return match?.[1] || undefined;
}

async function getSessionIdFromFile(sessionFile: string): Promise<string> {
  try {
    const line = await readFirstLine(sessionFile);
    if (line) {
      const id = extractJsonField(line, "id") || "";
      if (isSafeId(id)) return id;
    }
  } catch {}

  const basename = sessionFile.split("/").pop() || "";
  const match = basename.match(/_([0-9a-f-]{36})\.jsonl$/);
  if (match && isSafeId(match[1])) {
    return match[1];
  }

  return "";
}

function updateSessionInfo(state: AppState, sessionManager: any): void {
  state.checkpoint.currentSessionFile = sessionManager.getSessionFile();
  const header = sessionManager.getHeader();
  state.checkpoint.currentSessionId =
    header?.id && isSafeId(header.id) ? header.id : "";
}

// Re-export for use by agent hooks
export { getSessionIdFromFile, updateSessionInfo };

interface CheckpointRefInfo {
  id: string;
  timestamp: number;
}

function getCachedCheckpointById(
  state: AppState,
  id: string,
): CheckpointData | undefined {
  return state.checkpoint.checkpointCache?.find((cp) => cp.id === id);
}

function parseCheckpointTimestampFromId(id: string): number | undefined {
  const lastDash = id.lastIndexOf("-");
  if (lastDash === -1 || lastDash === id.length - 1) return undefined;
  const raw = id.slice(lastDash + 1);
  const ts = Number(raw);
  return Number.isFinite(ts) ? ts : undefined;
}

function findClosestCheckpointRef(
  refs: CheckpointRefInfo[],
  targetTs: number,
): CheckpointRefInfo | undefined {
  if (refs.length === 0) return undefined;
  return refs.reduce((best, ref) => {
    const bestDiff = Math.abs(best.timestamp - targetTs);
    const refDiff = Math.abs(ref.timestamp - targetTs);
    if (ref.timestamp <= targetTs && best.timestamp > targetTs) return ref;
    if (best.timestamp <= targetTs && ref.timestamp > targetTs) return best;
    return refDiff < bestDiff ? ref : best;
  });
}

function isUserEntry(entry: any): boolean | undefined {
  if (!entry) return undefined;
  const messageRole = entry.message?.role;
  if (typeof messageRole === "string") return messageRole === "user";
  const role = entry.role ?? entry.kind ?? entry.author;
  if (typeof role === "string") return role === "user";
  return undefined;
}

async function loadCheckpointForTarget(
  state: AppState,
  cwd: string,
  header: { id?: string; parentSession?: string } | undefined,
  targetTs: number,
  options: { targetTurnIndex?: number; targetSessionId?: string } = {},
): Promise<CheckpointData | null> {
  if (state.checkpoint.pendingCheckpoint)
    await state.checkpoint.pendingCheckpoint;

  const sessionIds: string[] = [];
  const directSessionIds: string[] = [];

  const targetSessionId =
    options.targetSessionId && isSafeId(options.targetSessionId)
      ? options.targetSessionId
      : undefined;

  if (targetSessionId) {
    directSessionIds.push(targetSessionId);
  } else if (header?.id && isSafeId(header.id)) {
    directSessionIds.push(header.id);
  } else if (state.checkpoint.currentSessionId) {
    directSessionIds.push(state.checkpoint.currentSessionId);
  }

  directSessionIds.forEach((id) => sessionIds.push(id));
  if (header?.id && isSafeId(header.id) && !sessionIds.includes(header.id)) {
    sessionIds.push(header.id);
  }

  // Walk the parentSession chain (fork lineage)
  const visitedParents = new Set<string>();
  const MAX_PARENT_DEPTH = 50;
  let parentSession = header?.parentSession;
  let depth = 0;

  while (parentSession && depth < MAX_PARENT_DEPTH) {
    if (visitedParents.has(parentSession)) break;
    visitedParents.add(parentSession);
    depth++;

    const match = parentSession.match(/_([0-9a-f-]{36})\.jsonl$/);
    if (match && isSafeId(match[1]) && !sessionIds.includes(match[1])) {
      sessionIds.push(match[1]);
    }
    try {
      const line = await readFirstLine(parentSession);
      const next = line ? extractJsonField(line, "parentSession") : undefined;
      parentSession = next && next !== parentSession ? next : undefined;
    } catch {
      break;
    }
  }

  if (sessionIds.length === 0) return null;

  const root = await getCachedRepoRoot(cwd);

  if (
    typeof options.targetTurnIndex === "number" &&
    Number.isFinite(options.targetTurnIndex) &&
    directSessionIds.length > 0
  ) {
    for (const sessionId of directSessionIds) {
      const candidateId = `${sessionId}-turn-${options.targetTurnIndex}-${targetTs}`;
      const cached = getCachedCheckpointById(state, candidateId);
      if (cached) return cached;

      const direct = await loadCheckpointFromRef(root, candidateId, true);
      if (direct) {
        addToCache(state, direct);
        return direct;
      }
    }
  }

  const refs = await listCheckpointRefs(root, true);
  if (refs.length === 0) return null;

  const refInfos: CheckpointRefInfo[] = [];
  for (const ref of refs) {
    const matchesSession = sessionIds.some((id) => ref.startsWith(`${id}-`));
    if (!matchesSession) continue;
    const timestamp = parseCheckpointTimestampFromId(ref);
    if (timestamp === undefined) continue;
    refInfos.push({ id: ref, timestamp });
  }

  if (refInfos.length === 0) return null;

  const exactRef = refInfos.find((ref) => ref.timestamp === targetTs);
  const bestRef = exactRef ?? findClosestCheckpointRef(refInfos, targetTs);
  if (!bestRef) return null;

  const cached = getCachedCheckpointById(state, bestRef.id);
  if (cached) return cached;

  const checkpoint = await loadCheckpointFromRef(root, bestRef.id, true);
  if (checkpoint) addToCache(state, checkpoint);
  return checkpoint ?? null;
}

async function saveAndRestore(
  state: AppState,
  cwd: string,
  target: CheckpointData,
  notify: (msg: string, type: "info" | "error" | "warning") => void,
): Promise<void> {
  try {
    const root = await getCachedRepoRoot(cwd);
    const beforeId = `${state.checkpoint.currentSessionId}-before-restore-${Date.now()}`;
    const newCp = await createCheckpoint(
      root,
      beforeId,
      0,
      state.checkpoint.currentSessionId,
    );
    addToCache(state, newCp);
    await restoreCheckpoint(root, target);
    notify("Files restored to checkpoint", "info");
  } catch (error) {
    notify(
      `Restore failed: ${error instanceof Error ? error.message : String(error)}`,
      "error",
    );
  }
}

// ─── Restore Prompt ────────────────────────────────────────────────────────────

async function handleRestorePrompt(
  state: AppState,
  ctx: any,
  getTargetEntryId: () => string,
  options: { requireUserEntry?: boolean } = {},
): Promise<undefined> {
  const targetEntry = ctx.sessionManager.getEntry(getTargetEntryId());

  if (options.requireUserEntry) {
    const isUser = isUserEntry(targetEntry);
    if (isUser !== true) {
      return undefined;
    }
  }

  const targetTs = targetEntry?.timestamp
    ? new Date(targetEntry.timestamp).getTime()
    : Date.now();

  const targetTurnIndex = targetEntry?.turnIndex ?? targetEntry?.turn;
  const targetSessionId = targetEntry?.sessionId;
  const exactTurnIndex = targetEntry?.timestamp ? targetTurnIndex : undefined;

  const checkpoint = await loadCheckpointForTarget(
    state,
    ctx.cwd,
    ctx.sessionManager.getHeader(),
    targetTs,
    {
      targetTurnIndex: exactTurnIndex,
      targetSessionId,
    },
  );

  if (!checkpoint) {
    return undefined;
  }

  const root = await getCachedRepoRoot(ctx.cwd);

  let currentTreeSha: string | null = null;
  try {
    currentTreeSha = await computeCurrentWorktreeTreeSha(root);
  } catch (error) {
    ctx.ui.notify(
      `Could not compare working tree to checkpoint: ${error instanceof Error ? error.message : String(error)}`,
      "warning",
    );
  }

  if (
    currentTreeSha !== null &&
    currentTreeSha === checkpoint.worktreeTreeSha
  ) {
    return undefined;
  }

  let message = "";
  if (currentTreeSha !== null) {
    const stat = await getDiffStat(
      root,
      checkpoint.worktreeTreeSha,
      currentTreeSha,
    );
    if (stat) {
      message = stat;
    }
  }

  const confirmed = await ctx.ui.confirm(
    "Restore working copy to snapshot from this message?",
    message,
  );
  if (!confirmed) {
    return undefined;
  }

  await saveAndRestore(state, ctx.cwd, checkpoint, ctx.ui.notify.bind(ctx.ui));

  // Working tree changed; refresh the diff-status widget against the
  // (unchanged) baseline.
  if (state.checkpoint.gitAvailable) {
    const root = await getCachedRepoRoot(ctx.cwd);
    await recomputeDiffStatus(state, root);
    refreshDiffStatusWidget(state, ctx);
  }

  return undefined;
}

// ─── Session Initialization Helpers ────────────────────────────────────────────

async function initSessionBasics(
  state: AppState,
  ctx: ExtensionContext,
): Promise<void> {
  // Detect git repo for checkpointing
  resetRepoCache();
  state.checkpoint.gitAvailable = await isGitRepo(ctx.cwd);
  if (state.checkpoint.gitAvailable) {
    updateSessionInfo(state, ctx.sessionManager);
  }
}

async function initBaselineForSession(
  state: AppState,
  ctx: ExtensionContext,
): Promise<void> {
  state.checkpoint.baselineTreeSha = null;
  state.checkpoint.diffStatLine = null;

  if (!state.checkpoint.gitAvailable) {
    refreshDiffStatusWidget(state, ctx);
    return;
  }

  if (!state.checkpoint.currentSessionId) {
    refreshDiffStatusWidget(state, ctx);
    return;
  }

  const root = await getCachedRepoRoot(ctx.cwd);
  state.checkpoint.baselineTreeSha = await loadBaselineTreeSha(
    root,
    state.checkpoint.currentSessionId,
  );
  await recomputeDiffStatus(state, root);
  refreshDiffStatusWidget(state, ctx);
}

async function syncSessionState(
  state: AppState,
  ctx: ExtensionContext,
): Promise<void> {
  // Update checkpoint session info (for git repos)
  if (state.checkpoint.gitAvailable) {
    updateSessionInfo(state, ctx.sessionManager);
  }

  // Resync session storage
  await resyncSessionStorage(state, ctx);

  // Sync todo state from storage
  syncTodoStateFromStorage(state);
  refreshTodoWidget(state, ctx);
}

// ─── Exported Handlers ─────────────────────────────────────────────────────────

export async function onSessionStart(
  state: AppState,
  _pi: ExtensionAPI,
  event: any,
  ctx: ExtensionContext,
) {
  // Initialize basics for all session starts
  await initSessionBasics(state, ctx);

  // Handle session-specific logic based on reason
  const reason = event.reason as
    | "startup"
    | "reload"
    | "new"
    | "resume"
    | "fork";

  switch (reason) {
    case "fork":
      // Fork: update checkpoint info and sync state
      if (state.checkpoint.gitAvailable) {
        updateSessionInfo(state, ctx.sessionManager);
      }
      await resyncSessionStorage(state, ctx);
      syncTodoStateFromStorage(state);
      refreshTodoWidget(state, ctx);
      break;

    case "resume":
    case "new":
      // Resume/new: check if switching between sessions (has previousSessionFile)
      if (event.previousSessionFile) {
        // Switching sessions: sync session state
        await syncSessionState(state, ctx);
      } else {
        // Fresh start: just resync session storage and sync todos
        await resyncSessionStorage(state, ctx);
        syncTodoStateFromStorage(state);
        refreshTodoWidget(state, ctx);
      }
      break;

    case "startup":
    case "reload":
    default:
      // Startup/reload: resync session storage and sync todos
      await resyncSessionStorage(state, ctx);
      syncTodoStateFromStorage(state);
      refreshTodoWidget(state, ctx);
      break;
  }

  // Pin the diff-status baseline for this loaded session, regardless of reason.
  await initBaselineForSession(state, ctx);
}

// Deprecated: kept for backward compatibility, use onSessionStart with reason check
// This is no longer registered as a handler since session_switch event was removed
export async function onSessionSwitch(
  state: AppState,
  _pi: ExtensionAPI,
  _event: any,
  ctx: ExtensionContext,
) {
  await syncSessionState(state, ctx);
}

// Deprecated: kept for backward compatibility, use onSessionStart with reason === "fork"
// This is no longer registered as a handler since session_fork event was removed
export async function onSessionFork(
  state: AppState,
  _pi: ExtensionAPI,
  _event: any,
  ctx: ExtensionContext,
) {
  if (state.checkpoint.gitAvailable) {
    updateSessionInfo(state, ctx.sessionManager);
  }
  await resyncSessionStorage(state, ctx);
  syncTodoStateFromStorage(state);
  refreshTodoWidget(state, ctx);
}

export async function onSessionTree(
  state: AppState,
  _pi: ExtensionAPI,
  _event: any,
  ctx: ExtensionContext,
) {
  // 1. Resync session storage
  await resyncSessionStorage(state, ctx);

  // 2. Sync todo state from storage
  syncTodoStateFromStorage(state);
  refreshTodoWidget(state, ctx);
}

export async function onSessionBeforeFork(
  state: AppState,
  event: any,
  ctx: ExtensionContext,
) {
  if (!state.checkpoint.gitAvailable) return undefined;
  return handleRestorePrompt(state, ctx, () => event.entryId);
}

export async function onSessionBeforeTree(
  state: AppState,
  event: any,
  ctx: ExtensionContext,
) {
  if (state.checkpoint.gitAvailable) {
    await handleRestorePrompt(state, ctx, () => event.preparation.targetId, {
      requireUserEntry: true,
    });
  }

  const override = state.plan.pendingTreeSummary;
  if (override) {
    delete state.plan.pendingTreeSummary;
    return { summary: override };
  }

  return undefined;
}

export async function onSessionShutdown(
  state: AppState,
  _event: any,
  _ctx: ExtensionContext,
) {
  // Clean up session storage (remove materialized files, remove dir if empty)
  if (state.sessionStorage.dir) {
    await clearSessionDirContents(state.sessionStorage.dir);
    await removeSessionDirIfEmpty(state.sessionStorage.dir);
  }
}
