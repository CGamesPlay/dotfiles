/**
 * Unified Application State
 *
 * A single AppState object replaces the closure-scoped state variables
 * scattered across the original extensions. Each concern gets a namespaced slice.
 */

export interface AppState {
  // Checkpoint
  checkpoint: {
    gitAvailable: boolean;
    checkpointingFailed: boolean;
    currentSessionId: string;
    currentSessionFile: string | undefined;
    checkpointCache: import("./lib/checkpoint-core.js").CheckpointData[] | null;
    pendingCheckpoint: Promise<void> | null;
  };

  // Plan workflow
  plan: {
    pendingFinishPlan: boolean;
  };

  // Todo
  todo: {
    /** Parsed from TODO.md — null if file doesn't exist or can't be parsed */
    items: Array<{ text: string; done: boolean }> | null;
    /** Whether we've already warned the agent about parse failure for current file content */
    parseErrorNotified: boolean;
    /** Raw content of TODO.md last time we parsed (to detect changes for re-warning) */
    lastRawContent: string | null;
    /** Manual widget visibility override */
    widgetVisibility: boolean | null;
  };

  // System assistant (completion mode)
  completion: {
    currentCommand: string | null;
  };

  // Session storage
  sessionStorage: {
    dir: string;
    /** What we believe the FS looks like. Absolute path → snapshot. */
    trackedFiles: Map<
      string,
      { content: string; ino: number; mtimeMs: number }
    >;
    /** Files currently being written by internal write/edit tools (suppress detection). */
    pendingInternalWrites: Set<string>;
  };
}

export function createAppState(): AppState {
  return {
    checkpoint: {
      gitAvailable: false,
      checkpointingFailed: false,
      currentSessionId: "",
      currentSessionFile: undefined,
      checkpointCache: null,
      pendingCheckpoint: null,
    },
    plan: {
      pendingFinishPlan: false,
    },
    todo: {
      items: null,
      parseErrorNotified: false,
      lastRawContent: null,
      widgetVisibility: null,
    },
    completion: {
      currentCommand: null,
    },
    sessionStorage: {
      dir: "",
      trackedFiles: new Map(),
      pendingInternalWrites: new Set(),
    },
  };
}
