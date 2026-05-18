import { before, describe, it, snapshot } from "node:test";
import chalk from "chalk";
import {
  getMarkdownTheme,
  initTheme,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import { type MarkdownTheme } from "@earendil-works/pi-tui";
import {
  COLLAPSED,
  EXPANDED,
  type RenderTaskResult,
} from "../lib/subagent-render.js";
import {
  buildResultComponent,
  renderCallComponent,
} from "../tools/subagent.js";

// Emit raw strings in snapshot files instead of JSON-escaped representations,
// so the files are readable as rendered terminal output.
snapshot.setDefaultSnapshotSerializers([
  (value) => (typeof value === "string" ? value : undefined),
]);

// Pin to the built-in dark theme so ANSI codes are deterministic across environments.
initTheme("dark");

// The `theme` proxy is not re-exported from the package index, so we access
// it via the file URL to bypass the exports field restriction.
let theme!: Theme;
let mdTheme!: MarkdownTheme;
before(async () => {
  // Force chalk to TrueColor level so bold/italic/etc. are always emitted,
  // regardless of whether stdout is a TTY in this test environment.
  chalk.level = 3;
  const p = new URL(
    "../../../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js",
    import.meta.url,
  );
  ({ theme } = (await import(p.href)) as { theme: Theme });
  mdTheme = getMarkdownTheme();
});

const T0 = 1_700_000_000_000;
const T_PARTIAL = T0 + 1_500;
const T_LATER = T0 + 3_000;

function makeTask(overrides: Partial<RenderTaskResult> = {}): RenderTaskResult {
  return {
    agent: "general-purpose",
    task: "Count to 3 and output the numbers 1, 2, 3.",
    exitCode: 0,
    usage: {
      input: 2,
      output: 62,
      cacheRead: 4500,
      cacheWrite: 0,
      cost: 0,
      contextTokens: 4600,
      turns: 1,
    },
    startedAt: T0,
    endedAt: T_LATER,
    presetName: "mid",
    displayItems: [],
    finalOutput: "1\n2\n3",
    ...overrides,
  };
}

const SECOND_TASK = {
  agent: "explorer",
  task: "List files in /tmp.",
} as const;

const RUNNING_BASE: Partial<RenderTaskResult> = {
  exitCode: -1,
  endedAt: undefined,
  displayItems: [],
  finalOutput: undefined,
};

const SIX_STEPS: Partial<RenderTaskResult> = {
  exitCode: -1,
  endedAt: undefined,
  displayItems: [
    { type: "toolCall", name: "bash", argsPreview: '{"command":"echo 1"}' },
    { type: "toolCall", name: "bash", argsPreview: '{"command":"echo 2"}' },
    { type: "toolCall", name: "bash", argsPreview: '{"command":"echo 3"}' },
    { type: "toolCall", name: "bash", argsPreview: '{"command":"echo 4"}' },
    { type: "toolCall", name: "bash", argsPreview: '{"command":"echo 5"}' },
    { type: "toolCall", name: "bash", argsPreview: '{"command":"echo 6"}' },
  ],
  finalOutput: undefined,
};

// 3 tool calls with results: first two succeed (results hidden), last fails
// (result shown). Exercises the tool result display rules.
const THREE_STEPS_WITH_RESULTS: Partial<RenderTaskResult> = {
  exitCode: -1,
  endedAt: undefined,
  displayItems: [
    { type: "toolCall", name: "bash", argsPreview: '{"command":"echo 1"}' },
    { type: "toolResult", isError: false, text: "1" },
    { type: "toolCall", name: "bash", argsPreview: '{"command":"echo 2"}' },
    { type: "toolResult", isError: false, text: "2" },
    { type: "toolCall", name: "bash", argsPreview: '{"command":"bad"}' },
    { type: "toolResult", isError: true, text: "command not found: bad" },
  ],
  finalOutput: undefined,
};

interface TestCase {
  name: string;
  callArgs: { tasks: Array<{ agent: string; task: string }> };
  /** Starting state for each task — all running with no progress. */
  initial: RenderTaskResult[];
  /** Per-task overrides applied to initial to produce the pending state. */
  toPending: Array<Partial<RenderTaskResult>>;
  /** Per-task overrides applied to pending to produce the final state. */
  toFinal: Array<Partial<RenderTaskResult>>;
}

const cases: TestCase[] = [
  {
    name: "single-task",
    callArgs: {
      tasks: [{ agent: "general-purpose", task: "Count to 3..." }],
    },
    initial: [makeTask(RUNNING_BASE)],
    // Agent runs 6 tool calls while still in progress.
    toPending: [SIX_STEPS],
    // Agent finishes successfully with output.
    toFinal: [{ exitCode: 0, endedAt: T_LATER, finalOutput: "1\n2\n3" }],
  },
  {
    name: "parallel-tasks",
    callArgs: {
      tasks: [{ agent: "general-purpose", task: "Count to 3..." }, SECOND_TASK],
    },
    initial: [
      makeTask(RUNNING_BASE),
      makeTask({ ...SECOND_TASK, ...RUNNING_BASE }),
    ],
    // Task 0 accrues 6 tool calls; task 1 finishes early.
    toPending: [SIX_STEPS, { exitCode: 0, endedAt: T_PARTIAL }],
    // Task 0 finishes; task 1 is already done (no changes).
    toFinal: [{ exitCode: 0, endedAt: T_LATER, finalOutput: "1\n2\n3" }, {}],
  },
  {
    name: "single-failed",
    callArgs: {
      tasks: [{ agent: "general-purpose", task: "Count to 3..." }],
    },
    initial: [makeTask(RUNNING_BASE)],
    // Agent runs 6 tool calls while still in progress.
    toPending: [SIX_STEPS],
    // Agent exits with a non-zero code and an error message.
    toFinal: [
      { exitCode: 1, endedAt: T_LATER, errorMessage: "Command failed" },
    ],
  },
  {
    name: "tool-results",
    callArgs: {
      tasks: [{ agent: "general-purpose", task: "Count to 3..." }],
    },
    initial: [makeTask(RUNNING_BASE)],
    // 3 tool calls: first two succeed (results hidden), last fails (result shown).
    toPending: [THREE_STEPS_WITH_RESULTS],
    // Agent finishes successfully despite the earlier tool error.
    toFinal: [{ exitCode: 0, endedAt: T_LATER, finalOutput: "1\n2\n3" }],
  },
];

function render(results: RenderTaskResult[], now: number) {
  return (config: typeof COLLAPSED) =>
    buildResultComponent(results, config, theme, mdTheme, now)
      .render(80)
      .join("\n");
}

for (const c of cases) {
  describe(c.name, () => {
    it("renderCall", (t) => {
      t.assert.snapshot(
        renderCallComponent(c.callArgs, theme).render(80).join("\n"),
      );
    });

    it("phases", (t) => {
      const pending = c.initial.map((r, i) => ({ ...r, ...c.toPending[i] }));
      const final = pending.map((r, i) => ({ ...r, ...c.toFinal[i] }));

      const ri = render(c.initial, T0);
      t.assert.snapshot(ri(COLLAPSED));
      t.assert.snapshot(ri(EXPANDED));

      const rp = render(pending, T_PARTIAL);
      t.assert.snapshot(rp(COLLAPSED));
      t.assert.snapshot(rp(EXPANDED));

      const rf = render(final, T_LATER);
      t.assert.snapshot(rf(COLLAPSED));
      t.assert.snapshot(rf(EXPANDED));
    });
  });
}
