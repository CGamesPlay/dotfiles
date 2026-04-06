/**
 * Unified Application State
 *
 * A single AppState object replaces the closure-scoped state variables
 * scattered across the original extensions. Each concern gets a namespaced slice.
 */

export interface AppState {
  // Elapsed timer
  timer: {
    interval: ReturnType<typeof setInterval> | null;
    startTime: number | undefined;
  };

  // Agent-end notification
  notify: {
    delayTimer: ReturnType<typeof setTimeout> | undefined;
  };

  // Bash tee tracking
  bashTee: {
    activeTees: Map<string, { teePath: string; originalCommand: string }>;
  };

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
    items: Array<{ id: number; text: string; done: boolean }>;
    nextId: number;
    widgetVisibility: boolean | null;
  };

  // System assistant (completion mode)
  completion: {
    currentCommand: string | null;
  };
}

export function createAppState(): AppState {
  return {
    timer: {
      interval: null,
      startTime: undefined,
    },
    notify: {
      delayTimer: undefined,
    },
    bashTee: {
      activeTees: new Map(),
    },
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
      items: [],
      nextId: 1,
      widgetVisibility: null,
    },
    completion: {
      currentCommand: null,
    },
  };
}
