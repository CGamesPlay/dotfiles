/**
 * Diff Status — `changes:` widget showing the delta between the session's
 * baseline checkpoint and the current working copy.
 *
 * The baseline is pinned at session-load time (the most recent existing
 * checkpoint for the current sessionId, or the first turn-start checkpoint
 * if none exists yet). It does not move during in-session navigation;
 * loading a different session re-derives it.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  computeCurrentWorktreeTreeSha,
  getDiffShortStat,
  listCheckpointRefs,
  loadCheckpointFromRef,
} from "./checkpoint-core.js";
import type { AppState } from "../state.js";

const STATUS_KEY = "10-changes";

/**
 * Find the most recent existing checkpoint for `sessionId` and return its
 * worktree tree SHA. Returns null if no checkpoint matches.
 *
 * Checkpoint ids have the shape `<sessionId>-...-<timestamp>`; the trailing
 * numeric segment is the millisecond timestamp recorded at creation.
 */
export async function loadBaselineTreeSha(
  root: string,
  sessionId: string,
): Promise<string | null> {
  if (!sessionId) return null;

  const refs = await listCheckpointRefs(root, true);
  const prefix = `${sessionId}-`;

  let bestRef: string | null = null;
  let bestTs = -Infinity;
  for (const ref of refs) {
    if (!ref.startsWith(prefix)) continue;
    const lastDash = ref.lastIndexOf("-");
    if (lastDash === -1 || lastDash === ref.length - 1) continue;
    const ts = Number(ref.slice(lastDash + 1));
    if (!Number.isFinite(ts)) continue;
    if (ts > bestTs) {
      bestTs = ts;
      bestRef = ref;
    }
  }

  if (!bestRef) return null;

  const cp = await loadCheckpointFromRef(root, bestRef, true);
  return cp?.worktreeTreeSha ?? null;
}

/**
 * Recompute `state.checkpoint.diffStatLine` from
 * `state.checkpoint.baselineTreeSha` against the current worktree.
 *
 * Sets `diffStatLine` to:
 *   - `null` if there is no baseline, no repo, or the diff failed
 *   - `null` if the trees are identical (empty shortstat output)
 *   - the trimmed shortstat line otherwise
 */
export async function recomputeDiffStatus(
  state: AppState,
  root: string,
): Promise<void> {
  const baseline = state.checkpoint.baselineTreeSha;
  if (!baseline) {
    state.checkpoint.diffStatLine = null;
    return;
  }

  const currentSha = await computeCurrentWorktreeTreeSha(root);
  if (!currentSha) {
    state.checkpoint.diffStatLine = null;
    return;
  }

  if (currentSha === baseline) {
    state.checkpoint.diffStatLine = null;
    return;
  }

  const stat = await getDiffShortStat(root, baseline, currentSha);
  const trimmed = stat?.trim() ?? "";
  state.checkpoint.diffStatLine = trimmed.length > 0 ? trimmed : null;
}

/** Update the `changes:` footer status based on `state.checkpoint.diffStatLine`. */
export function refreshDiffStatusWidget(
  state: AppState,
  ctx: ExtensionContext,
): void {
  if (!state.checkpoint.gitAvailable) {
    ctx.ui.setStatus(STATUS_KEY, "(no git)");
    return;
  }
  const line = state.checkpoint.diffStatLine;
  ctx.ui.setStatus(STATUS_KEY, line ? `changes: ${line}` : "(no changes)");
}
