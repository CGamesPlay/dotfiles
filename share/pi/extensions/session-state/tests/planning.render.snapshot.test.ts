/**
 * Planning Tool — Render Snapshot Tests
 *
 * Covers renderCall and renderResult for the finish_plan tool across all
 * meaningful render states. Uses the real dark theme so ANSI output is
 * deterministic and human-readable in the snapshot file.
 */

import { before, describe, it, snapshot } from "node:test";
import chalk from "chalk";
import {
  getMarkdownTheme,
  initTheme,
  type Theme,
} from "@mariozechner/pi-coding-agent";
import type { MarkdownTheme } from "@mariozechner/pi-tui";
import { createAppState, type AppState } from "../state.js";
import { registerPlanningTools } from "../tools/planning.js";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";

// Fixed storage path keeps plan file paths deterministic across runs.
const STORAGE = "/tmp/planning-snapshot-test";
process.env.PI_SESSION_STORAGE = STORAGE;

// Emit raw strings in snapshot files so they're readable as rendered terminal output.
snapshot.setDefaultSnapshotSerializers([
  (value) => (typeof value === "string" ? value : undefined),
]);

initTheme("dark");

let theme!: Theme;
let _mdTheme!: MarkdownTheme;
before(async () => {
  chalk.level = 3;
  const p = new URL(
    "../../../node_modules/@mariozechner/pi-coding-agent/dist/modes/interactive/theme/theme.js",
    import.meta.url,
  );
  ({ theme } = (await import(p.href)) as { theme: Theme });
  _mdTheme = getMarkdownTheme();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeState(): AppState {
  const state = createAppState();
  state.sessionStorage.dir = STORAGE;
  return state;
}

function getTool(state: AppState): ToolDefinition {
  const tools = new Map<string, any>();
  registerPlanningTools(state, {
    registerTool(def: any) {
      tools.set(def.name, def);
    },
    on() {},
    registerFlag() {},
    getFlag() {
      return undefined;
    },
  } as any);
  return tools.get("finish_plan");
}

function trackPlan(state: AppState, content: string) {
  state.sessionStorage.trackedFiles.set(`${STORAGE}/PLAN.md`, {
    content,
    ino: 0,
    mtimeMs: 0,
  });
}

function makeCallContext(overrides: Record<string, unknown> = {}) {
  return {
    args: {},
    toolCallId: "tc-1",
    invalidate: () => {},
    lastComponent: undefined,
    state: {},
    cwd: "/test",
    executionStarted: false,
    argsComplete: true,
    isPartial: false,
    expanded: false,
    showImages: false,
    isError: false,
    ...overrides,
  } as any;
}

function renderCall(
  tool: ToolDefinition,
  ctx: ReturnType<typeof makeCallContext>,
): string {
  return tool.renderCall!({}, theme, ctx).render(80).join("\n");
}

function renderResult(
  tool: ToolDefinition,
  result: AgentToolResult<any>,
  opts: { expanded: boolean; isPartial: boolean },
  ctx: ReturnType<typeof makeCallContext>,
): string {
  return tool.renderResult!(result, opts, theme, ctx).render(80).join("\n");
}

const PLAN_MD = "# My Plan\n\n1. Step one\n2. Step two\n3. Step three";

const SUCCESS_RESULT: AgentToolResult<any> = {
  content: [{ type: "text", text: "Plan approved. Begin implementing." }],
  details: {},
};

const ERROR_RESULT: AgentToolResult<any> = {
  content: [
    {
      type: "text",
      text: "Error: No plan file found. Write your plan to /tmp/planning-snapshot-test/PLAN.md before using this tool.",
    },
  ],
  details: {},
};

// ─── renderCall ───────────────────────────────────────────────────────────────

describe("finish_plan renderCall", () => {
  it("no plan, not partial, not expanded — title + path only", (t) => {
    const state = makeState();
    const tool = getTool(state);
    t.assert.snapshot(renderCall(tool, makeCallContext()));
  });

  it("no plan, isPartial — title + path only (no plan to expand)", (t) => {
    const state = makeState();
    const tool = getTool(state);
    t.assert.snapshot(renderCall(tool, makeCallContext({ isPartial: true })));
  });

  it("plan present, not partial, not expanded — title + path only", (t) => {
    const state = makeState();
    trackPlan(state, PLAN_MD);
    const tool = getTool(state);
    t.assert.snapshot(renderCall(tool, makeCallContext()));
  });

  it("plan present, isPartial — title + path + plan markdown", (t) => {
    const state = makeState();
    trackPlan(state, PLAN_MD);
    const tool = getTool(state);
    t.assert.snapshot(renderCall(tool, makeCallContext({ isPartial: true })));
  });

  it("plan present, expanded — title + path + plan markdown", (t) => {
    const state = makeState();
    trackPlan(state, PLAN_MD);
    const tool = getTool(state);
    t.assert.snapshot(renderCall(tool, makeCallContext({ expanded: true })));
  });
});

// ─── renderResult ─────────────────────────────────────────────────────────────

describe("finish_plan renderResult", () => {
  it("error — red error message", (t) => {
    const state = makeState();
    const tool = getTool(state);
    const ctx = makeCallContext({ isError: true });
    t.assert.snapshot(
      renderResult(tool, ERROR_RESULT, { expanded: false, isPartial: false }, ctx),
    );
  });

  it("success, not expanded — dim status text", (t) => {
    const state = makeState();
    const tool = getTool(state);
    const ctx = makeCallContext();
    t.assert.snapshot(
      renderResult(tool, SUCCESS_RESULT, { expanded: false, isPartial: false }, ctx),
    );
  });

  it("success, expanded — separator + dim status text", (t) => {
    const state = makeState();
    const tool = getTool(state);
    const ctx = makeCallContext({ expanded: true });
    t.assert.snapshot(
      renderResult(tool, SUCCESS_RESULT, { expanded: true, isPartial: false }, ctx),
    );
  });
});
