import { describe, it, before, after, snapshot } from "node:test";
import assert from "node:assert/strict";
import stripAnsi from "strip-ansi";
import path from "node:path";
import {
  createTestSession,
  type TestSession,
} from "../../../test-harness/index.js";

snapshot.setResolveSnapshotPath((testPath) => testPath + ".snapshot");
snapshot.setDefaultSnapshotSerializers([
  (value) =>
    typeof value === "string"
      ? stripAnsi(value)
      : JSON.stringify(value, null, 2),
]);
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  computeDiffLines,
  normalizeGaps,
  parsePiDiff,
  trimContext,
  trimTrailingRemovals,
  stripLineNumbers,
  formatDiffLines,
  formatContentLines,
  formatCollapsible,
  diffSummary,
  renderDiffResult,
  renderWrittenContent,
  collectEditDiffLines,
  COLLAPSED_MAX_LINES,
  type DiffLine,
} from "../lib/diff.js";
import type {
  ToolDefinition,
  ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";

import type { Component } from "@earendil-works/pi-tui";
import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import { Text } from "@earendil-works/pi-tui";

// ─── Theme ─────────────────────────────────────────────────────────────────────

import { Theme } from "@earendil-works/pi-coding-agent";

const fgColors: Record<string, string> = {
  accent: "#8abeb7",
  border: "#5f87ff",
  borderAccent: "#00d7ff",
  borderMuted: "#505050",
  success: "#b5bd68",
  error: "#cc6666",
  warning: "#ffff00",
  muted: "#808080",
  dim: "#666666",
  text: "",
  thinkingText: "#808080",
  userMessageText: "",
  customMessageText: "",
  customMessageLabel: "#9575cd",
  toolTitle: "",
  toolOutput: "#808080",
  mdHeading: "#f0c674",
  mdLink: "#81a2be",
  mdLinkUrl: "#666666",
  mdCode: "#8abeb7",
  mdCodeBlock: "#b5bd68",
  mdCodeBlockBorder: "#808080",
  mdQuote: "#808080",
  mdQuoteBorder: "#808080",
  mdHr: "#808080",
  mdListBullet: "#8abeb7",
  toolDiffAdded: "#b5bd68",
  toolDiffRemoved: "#cc6666",
  toolDiffContext: "#808080",
  syntaxComment: "#6A9955",
  syntaxKeyword: "#569CD6",
  syntaxFunction: "#DCDCAA",
  syntaxVariable: "#9CDCFE",
  syntaxString: "#CE9178",
  syntaxNumber: "#B5CEA8",
  syntaxType: "#4EC9B0",
  syntaxOperator: "#D4D4D4",
  syntaxPunctuation: "#D4D4D4",
  thinkingOff: "#505050",
  thinkingMinimal: "#6e6e6e",
  thinkingLow: "#5f87af",
  thinkingMedium: "#81a2be",
  thinkingHigh: "#b294bb",
  thinkingXhigh: "#d183e8",
  bashMode: "#b5bd68",
};
const bgColors: Record<string, string> = {
  selectedBg: "#3a3a4a",
  userMessageBg: "#343541",
  customMessageBg: "#2d2838",
  toolPendingBg: "#282832",
  toolSuccessBg: "#283228",
  toolErrorBg: "#3c2828",
};
const theme = new Theme(fgColors as any, bgColors as any, "256color");

// ─── Mock ToolRenderContext ────────────────────────────────────────────────────

/** Local interface matching the shape of ToolRenderContext (not re-exported from the package). */
interface ToolRenderContext<TState = any, TArgs = any> {
  args: TArgs;
  toolCallId: string;
  invalidate: () => void;
  lastComponent: Component | undefined;
  state: TState;
  cwd: string;
  executionStarted: boolean;
  argsComplete: boolean;
  isPartial: boolean;
  expanded: boolean;
  showImages: boolean;
  isError: boolean;
}

function createRenderContext(
  overrides: Partial<ToolRenderContext> = {},
): ToolRenderContext {
  return {
    args: {},
    toolCallId: "test-tool-call-id",
    invalidate: () => {},
    lastComponent: undefined,
    state: {},
    cwd: "/test",
    executionStarted: false,
    argsComplete: false,
    isPartial: true,
    expanded: false,
    showImages: false,
    isError: false,
    ...overrides,
  };
}

// ─── Helper: render Text to string ─────────────────────────────────────────────

function renderText(component: any, width = 200): string {
  if (component instanceof Text) {
    return component
      .render(width)
      .map((line) => line.trimEnd())
      .join("\n");
  }
  return String(component);
}

// ═══════════════════════════════════════════════════════════════════════════════
// computeDiffLines
// ═══════════════════════════════════════════════════════════════════════════════

describe("computeDiffLines", () => {
  it("identical strings → empty array", () => {
    const result = computeDiffLines("hello\n", "hello\n");
    assert.deepStrictEqual(result, []);
  });

  it("single line addition (empty → content)", () => {
    const result = computeDiffLines("", "hello");
    assert.deepStrictEqual(result, [
      { type: "added", newNum: 1, content: "hello" },
    ]);
  });

  it("single line removal", () => {
    const result = computeDiffLines("hello", "");
    assert.deepStrictEqual(result, [
      { type: "removed", oldNum: 1, content: "hello" },
    ]);
  });

  it("single line replacement", () => {
    const result = computeDiffLines("hello", "world");
    assert.deepStrictEqual(result, [
      { type: "removed", oldNum: 1, content: "hello" },
      { type: "added", newNum: 1, content: "world" },
    ]);
  });

  it("multi-hunk changes with gap collapsing", () => {
    const old = "line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\n";
    const nw = "line1\nLINE2\nline3\nline4\nline5\nline6\nLINE7\nline8\n";
    const result = computeDiffLines(old, nw, 1);
    // Should have two change hunks separated by a gap
    const types = result.map((l) => l.type);
    assert.ok(types.includes("gap"), "should contain a gap between hunks");
    assert.ok(types.includes("removed"), "should have removals");
    assert.ok(types.includes("added"), "should have additions");
  });

  it("entire new file (empty string → multi-line content)", () => {
    const result = computeDiffLines("", "line1\nline2\nline3");
    assert.strictEqual(result.length, 3);
    for (const line of result) {
      assert.strictEqual(line.type, "added");
    }
    assert.deepStrictEqual(
      result.map((l) => l.content),
      ["line1", "line2", "line3"],
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// parsePiDiff
// ═══════════════════════════════════════════════════════════════════════════════

describe("parsePiDiff", () => {
  it("standard pi diff with context/added/removed lines", () => {
    const diff = [
      "  1 context line",
      "- 2 old line",
      "+ 2 new line",
      "  3 context line",
    ].join("\n");
    const result = parsePiDiff(diff);
    assert.strictEqual(result[0].type, "context");
    assert.strictEqual(result[0].oldNum, 1);
    assert.strictEqual(result[1].type, "removed");
    assert.strictEqual(result[1].oldNum, 2);
    assert.strictEqual(result[2].type, "added");
    assert.strictEqual(result[2].newNum, 2);
    assert.strictEqual(result[3].type, "context");
    assert.strictEqual(result[3].oldNum, 3);
  });

  it("interleaved additions and removals", () => {
    const diff = [
      "- 1 removed1",
      "+ 1 added1",
      "- 2 removed2",
      "+ 2 added2",
    ].join("\n");
    const result = parsePiDiff(diff);
    const types = result.map((l) => l.type);
    assert.deepStrictEqual(types, ["removed", "added", "removed", "added"]);
  });

  it("unrecognized lines → gaps", () => {
    const diff = "---\n  1 context\n---";
    const result = parsePiDiff(diff);
    assert.strictEqual(result[0].type, "gap");
    assert.strictEqual(result[1].type, "context");
    assert.strictEqual(result[2].type, "gap");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// trimContext
// ═══════════════════════════════════════════════════════════════════════════════

describe("trimContext", () => {
  it("reduces context lines down to requested count", () => {
    const lines: DiffLine[] = [
      { type: "context", oldNum: 1, newNum: 1, content: "ctx1" },
      { type: "context", oldNum: 2, newNum: 2, content: "ctx2" },
      { type: "context", oldNum: 3, newNum: 3, content: "ctx3" },
      { type: "context", oldNum: 4, newNum: 4, content: "ctx4" },
      { type: "removed", oldNum: 5, content: "old" },
      { type: "added", newNum: 5, content: "new" },
      { type: "context", oldNum: 6, newNum: 6, content: "ctx5" },
      { type: "context", oldNum: 7, newNum: 7, content: "ctx6" },
      { type: "context", oldNum: 8, newNum: 8, content: "ctx7" },
      { type: "context", oldNum: 9, newNum: 9, content: "ctx8" },
    ];
    const result = trimContext(lines, 1);
    // Should keep only 1 context before and 1 after the change
    const types = result.map((l) => l.type);
    assert.ok(types.includes("removed"));
    assert.ok(types.includes("added"));
    const contextCount = types.filter((t) => t === "context").length;
    assert.ok(
      contextCount <= 2,
      `expected ≤2 context lines, got ${contextCount}`,
    );
  });

  it("preserves all change lines", () => {
    const lines: DiffLine[] = [
      { type: "removed", oldNum: 1, content: "a" },
      { type: "removed", oldNum: 2, content: "b" },
      { type: "added", newNum: 1, content: "c" },
      { type: "added", newNum: 2, content: "d" },
    ];
    const result = trimContext(lines, 1);
    assert.strictEqual(result.length, 4);
    assert.deepStrictEqual(
      result.map((l) => l.type),
      ["removed", "removed", "added", "added"],
    );
  });

  it("collapses long context runs between changes", () => {
    const lines: DiffLine[] = [
      { type: "removed", oldNum: 1, content: "old1" },
      { type: "added", newNum: 1, content: "new1" },
      // 10 context lines between changes
      ...Array.from({ length: 10 }, (_, i) => ({
        type: "context" as const,
        oldNum: i + 2,
        newNum: i + 2,
        content: `mid${i}`,
      })),
      { type: "removed", oldNum: 12, content: "old2" },
      { type: "added", newNum: 12, content: "new2" },
    ];
    const result = trimContext(lines, 1);
    const types = result.map((l) => l.type);
    assert.ok(
      types.includes("gap"),
      "should have a gap between distant changes",
    );
    // Context lines should be reduced
    const contextCount = types.filter((t) => t === "context").length;
    assert.ok(
      contextCount <= 4,
      `expected ≤4 context lines, got ${contextCount}`,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// normalizeGaps
// ═══════════════════════════════════════════════════════════════════════════════

describe("normalizeGaps", () => {
  it("removes leading/trailing gaps", () => {
    const lines: DiffLine[] = [
      { type: "gap", content: "" },
      { type: "added", newNum: 1, content: "hello" },
      { type: "gap", content: "" },
    ];
    const result = normalizeGaps(lines);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, "added");
  });

  it("collapses consecutive gaps", () => {
    const lines: DiffLine[] = [
      { type: "added", newNum: 1, content: "a" },
      { type: "gap", content: "" },
      { type: "gap", content: "" },
      { type: "gap", content: "" },
      { type: "added", newNum: 5, content: "b" },
    ];
    const result = normalizeGaps(lines);
    assert.strictEqual(result.length, 3);
    assert.strictEqual(result[0].type, "added");
    assert.strictEqual(result[1].type, "gap");
    assert.strictEqual(result[2].type, "added");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// formatCollapsible (snapshot)
// ═══════════════════════════════════════════════════════════════════════════════

describe("formatCollapsible", () => {
  it("short content — no truncation", (t) => {
    const formatted = ["line1", "line2", "line3"];
    const result = formatCollapsible(formatted, "summary", false, theme);
    t.assert.snapshot(result);
  });

  it("long content collapsed — first N lines + 'N more lines'", (t) => {
    const formatted = Array.from({ length: 20 }, (_, i) => `line${i + 1}`);
    const result = formatCollapsible(formatted, "summary", false, theme);
    t.assert.snapshot(result);
  });

  it("long content expanded — all lines", (t) => {
    const formatted = Array.from({ length: 20 }, (_, i) => `line${i + 1}`);
    const result = formatCollapsible(formatted, "summary", true, theme);
    t.assert.snapshot(result);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// trimTrailingRemovals
// ═══════════════════════════════════════════════════════════════════════════════

describe("trimTrailingRemovals", () => {
  it("no trailing removals → unchanged", () => {
    const lines: DiffLine[] = [
      { type: "removed", oldNum: 1, content: "old" },
      { type: "added", newNum: 1, content: "new" },
    ];
    const result = trimTrailingRemovals(lines);
    assert.deepStrictEqual(result, lines);
  });

  it("1 plus + 1 minus at tail → keep 1, drop 0", () => {
    const lines: DiffLine[] = [
      { type: "context", oldNum: 1, newNum: 1, content: "ctx" },
      { type: "removed", oldNum: 2, content: "old" },
      { type: "added", newNum: 2, content: "new" },
    ];
    const result = trimTrailingRemovals(lines);
    assert.deepStrictEqual(result, lines);
  });

  it("1 plus + 10 minus at tail → keep 1, drop 9", () => {
    const minus = Array.from({ length: 10 }, (_, i) => ({
      type: "removed" as const,
      oldNum: i + 1,
      content: `old${i}`,
    }));
    const plus: DiffLine[] = [{ type: "added", newNum: 1, content: "new" }];
    const lines: DiffLine[] = [...minus, ...plus];
    const result = trimTrailingRemovals(lines);
    // Should keep first 1 minus (1 - 1 + 1 = 1) + the 1 plus
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].type, "removed");
    assert.strictEqual(result[1].type, "added");
  });

  it("3 plus + 10 minus at tail → keep 3, drop 7", () => {
    const minus = Array.from({ length: 10 }, (_, i) => ({
      type: "removed" as const,
      oldNum: i + 1,
      content: `old${i}`,
    }));
    const plus = Array.from({ length: 3 }, (_, i) => ({
      type: "added" as const,
      newNum: i + 1,
      content: `new${i}`,
    }));
    const lines: DiffLine[] = [...minus, ...plus];
    const result = trimTrailingRemovals(lines);
    // keep = min(10, 3) = 3 minus, drop 7
    assert.strictEqual(result.length, 6); // 3 minus + 3 plus
    assert.strictEqual(result.filter((l) => l.type === "removed").length, 3);
    assert.strictEqual(result.filter((l) => l.type === "added").length, 3);
  });

  it("0 plus + 5 minus at tail → keep all 5, drop 0", () => {
    const lines: DiffLine[] = [
      { type: "context", oldNum: 1, newNum: 1, content: "ctx" },
      ...Array.from({ length: 5 }, (_, i) => ({
        type: "removed" as const,
        oldNum: i + 2,
        content: `old${i}`,
      })),
    ];
    const result = trimTrailingRemovals(lines);
    assert.deepStrictEqual(result, lines);
  });

  it("equal plus and minus at tail → keep all minus (no excess)", () => {
    // 3 minus + 3 plus: keep = min(3, 3) = 3, drop = 0 — nothing to trim.
    const minus = Array.from({ length: 3 }, (_, i) => ({
      type: "removed" as const,
      oldNum: i + 1,
      content: `old${i}`,
    }));
    const plus = Array.from({ length: 3 }, (_, i) => ({
      type: "added" as const,
      newNum: i + 1,
      content: `new${i}`,
    }));
    const lines: DiffLine[] = [...minus, ...plus];
    const result = trimTrailingRemovals(lines);
    // keep = min(3, 3) = 3, drop = 0
    assert.deepStrictEqual(result, lines);
  });

  it("only added lines (no removals) → unchanged", () => {
    const lines: DiffLine[] = [
      { type: "added", newNum: 1, content: "a" },
      { type: "added", newNum: 2, content: "b" },
    ];
    const result = trimTrailingRemovals(lines);
    assert.deepStrictEqual(result, lines);
  });

  it("context lines between changes at tail are not counted", () => {
    // Trailing context should block the minus counting.
    // At the tail: 1 plus (a2), then 2 minus (r2, r3) immediately before it.
    // keep = min(2, 1) = 1, drop = 1 → r3 is dropped.
    const lines: DiffLine[] = [
      { type: "removed", oldNum: 1, content: "r" },
      { type: "added", newNum: 1, content: "a" },
      { type: "context", oldNum: 2, newNum: 2, content: "ctx" },
      { type: "removed", oldNum: 3, content: "r2" },
      { type: "removed", oldNum: 4, content: "r3" },
      { type: "added", newNum: 3, content: "a2" },
    ];
    const result = trimTrailingRemovals(lines);
    // r3 should be dropped (1 plus can only pair with 1 minus)
    assert.deepStrictEqual(result, [
      { type: "removed", oldNum: 1, content: "r" },
      { type: "added", newNum: 1, content: "a" },
      { type: "context", oldNum: 2, newNum: 2, content: "ctx" },
      { type: "removed", oldNum: 3, content: "r2" },
      { type: "added", newNum: 3, content: "a2" },
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// collectEditDiffLines
// ═══════════════════════════════════════════════════════════════════════════════

describe("collectEditDiffLines", () => {
  it("single oldText/newText edit", () => {
    const args = { oldText: "hello", newText: "world" };
    const result = collectEditDiffLines(args);
    assert.ok(result.length > 0);
    assert.ok(result.some((l) => l.type === "removed"));
    assert.ok(result.some((l) => l.type === "added"));
  });

  it("multi-edit via edits array", () => {
    const args = {
      edits: [
        { oldText: "a", newText: "b" },
        { oldText: "c", newText: "d" },
      ],
    };
    const result = collectEditDiffLines(args);
    const removed = result.filter((l) => l.type === "removed");
    const added = result.filter((l) => l.type === "added");
    assert.strictEqual(removed.length, 2);
    assert.strictEqual(added.length, 2);
  });

  it("missing fields (streaming partial args)", () => {
    // Only oldText arrived so far
    const result1 = collectEditDiffLines({ oldText: "hello" });
    assert.ok(result1.some((l) => l.type === "removed"));

    // Only newText arrived so far
    const result2 = collectEditDiffLines({ newText: "world" });
    assert.ok(result2.some((l) => l.type === "added"));

    // Empty args (very early streaming)
    const result3 = collectEditDiffLines({});
    assert.strictEqual(result3.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// End-to-end render tests (via registered tool)
// ═══════════════════════════════════════════════════════════════════════════════

describe("end-to-end render", () => {
  const tools: Record<string, ToolDefinition> = {};
  let tmpDir: string;
  let t: TestSession;

  before(async () => {
    const EXTENSION = path.resolve(import.meta.dirname, "../index.ts");
    tmpDir = mkdtempSync(join(tmpdir(), "tool-renderer-test-"));
    const origCwd = process.cwd;
    process.cwd = () => tmpDir;
    try {
      t = await createTestSession({ extensions: [EXTENSION], cwd: tmpDir });
    } finally {
      process.cwd = origCwd;
    }
    for (const name of ["edit", "write"]) {
      const def = (t.session as any).getToolDefinition(name) as
        | ToolDefinition
        | undefined;
      assert.ok(def, `expected ${name} tool definition`);
      tools[name] = def;
    }
  });

  after(() => {
    t?.dispose();
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─── Helpers ───────────────────────────────────────────────────────────

  /** Render both renderCall and renderResult and return them as a combined snapshot. */
  function renderBoth(
    toolName: string,
    args: Record<string, any>,
    ctx: ToolRenderContext,
    result: AgentToolResult<any>,
    opts: ToolRenderResultOptions,
  ): string {
    const tool = tools[toolName];
    const callText = renderText(tool.renderCall!(args, theme, ctx));
    const resultText = renderText(tool.renderResult!(result, opts, theme, ctx));
    return `--- renderCall ---\n${callText}\n--- renderResult ---\n${resultText}`;
  }

  // ─── Edit tool: partial streaming scenarios ────────────────────────────

  it("edit partial — oldText only (no newText yet)", (t) => {
    const ctx = createRenderContext({
      isPartial: true,
      executionStarted: false,
      argsComplete: false,
      args: { path: "test.ts", oldText: "old line" },
    });
    const result: AgentToolResult<any> = { content: [], details: undefined };
    const opts: ToolRenderResultOptions = { expanded: false, isPartial: true };
    t.assert.snapshot(renderBoth("edit", ctx.args, ctx, result, opts));
  });

  it("edit partial — newText only (no oldText yet)", (t) => {
    const ctx = createRenderContext({
      isPartial: true,
      executionStarted: false,
      argsComplete: false,
      args: { path: "test.ts", newText: "new line" },
    });
    const result: AgentToolResult<any> = { content: [], details: undefined };
    const opts: ToolRenderResultOptions = { expanded: false, isPartial: true };
    t.assert.snapshot(renderBoth("edit", ctx.args, ctx, result, opts));
  });

  it("edit partial — both oldText and newText", (t) => {
    const ctx = createRenderContext({
      isPartial: true,
      executionStarted: false,
      argsComplete: false,
      args: { path: "test.ts", oldText: "old line", newText: "new line" },
    });
    const result: AgentToolResult<any> = { content: [], details: undefined };
    const opts: ToolRenderResultOptions = { expanded: false, isPartial: true };
    t.assert.snapshot(renderBoth("edit", ctx.args, ctx, result, opts));
  });

  it("edit partial — multi-edit, first edit complete, second streaming", (t) => {
    const ctx = createRenderContext({
      isPartial: true,
      executionStarted: false,
      argsComplete: false,
      args: {
        path: "test.ts",
        edits: [
          { oldText: "alpha", newText: "beta" },
          { oldText: "gamma" }, // newText not yet streamed
        ],
      },
    });
    const result: AgentToolResult<any> = { content: [], details: undefined };
    const opts: ToolRenderResultOptions = { expanded: false, isPartial: true };
    t.assert.snapshot(renderBoth("edit", ctx.args, ctx, result, opts));
  });

  // ─── Edit tool: execution started (no preview diff) ───────────────────

  it("edit executing — preview diff in renderCall", (t) => {
    const ctx = createRenderContext({
      isPartial: true,
      executionStarted: true,
      argsComplete: true,
      args: { path: "test.ts", oldText: "foo", newText: "bar" },
    });
    const result: AgentToolResult<any> = { content: [], details: undefined };
    const opts: ToolRenderResultOptions = { expanded: false, isPartial: true };
    t.assert.snapshot(renderBoth("edit", ctx.args, ctx, result, opts));
  });

  // ─── Edit tool: full result ────────────────────────────────────────────

  it("edit complete — with details.diff", (t) => {
    const ctx = createRenderContext({
      isPartial: false,
      executionStarted: true,
      argsComplete: true,
      args: { path: "test.ts", oldText: "old line", newText: "new line" },
    });
    const result: AgentToolResult<any> = {
      content: [{ type: "text", text: "Successfully edited test.ts" }],
      details: {
        diff: [
          "  1 context before",
          "- 2 old line",
          "+ 2 new line",
          "  3 context after",
        ].join("\n"),
      },
    };
    const opts: ToolRenderResultOptions = { expanded: false, isPartial: false };
    t.assert.snapshot(renderBoth("edit", ctx.args, ctx, result, opts));
  });

  it("edit complete — without details.diff (fallback to args)", (t) => {
    const ctx = createRenderContext({
      isPartial: false,
      executionStarted: true,
      argsComplete: true,
      args: { path: "test.ts", oldText: "alpha", newText: "beta" },
    });
    const result: AgentToolResult<any> = {
      content: [{ type: "text", text: "Successfully edited test.ts" }],
      details: undefined,
    };
    const opts: ToolRenderResultOptions = { expanded: false, isPartial: false };
    t.assert.snapshot(renderBoth("edit", ctx.args, ctx, result, opts));
  });

  it("edit complete — multi-edit with details.diff", (t) => {
    const ctx = createRenderContext({
      isPartial: false,
      executionStarted: true,
      argsComplete: true,
      args: {
        path: "test.ts",
        edits: [
          { oldText: "alpha", newText: "beta" },
          { oldText: "gamma", newText: "delta" },
        ],
      },
    });
    const result: AgentToolResult<any> = {
      content: [{ type: "text", text: "Successfully edited test.ts" }],
      details: {
        diff: [
          "  5 before",
          "- 6 alpha",
          "+ 6 beta",
          "  7 between",
          "     ...",
          " 20 before2",
          "-21 gamma",
          "+21 delta",
          " 22 after2",
        ].join("\n"),
      },
    };
    const opts: ToolRenderResultOptions = { expanded: false, isPartial: false };
    t.assert.snapshot(renderBoth("edit", ctx.args, ctx, result, opts));
  });

  it("edit complete — error", (t) => {
    const ctx = createRenderContext({
      isPartial: false,
      executionStarted: true,
      argsComplete: true,
      isError: true,
      args: { path: "test.ts" },
    });
    const result: AgentToolResult<any> = {
      content: [
        {
          type: "text",
          text: "Error: File not found: test.ts\nStack trace...",
        },
      ],
      details: undefined,
    };
    const opts: ToolRenderResultOptions = { expanded: false, isPartial: false };
    t.assert.snapshot(renderBoth("edit", ctx.args, ctx, result, opts));
  });

  it("edit complete — expanded view shows all lines", (t) => {
    const ctx = createRenderContext({
      isPartial: false,
      executionStarted: true,
      argsComplete: true,
      expanded: true,
      args: { path: "test.ts", oldText: "old", newText: "new" },
    });
    const result: AgentToolResult<any> = {
      content: [{ type: "text", text: "Successfully edited test.ts" }],
      details: {
        diff: [
          "  1 context before",
          "- 2 old",
          "+ 2 new",
          "  3 context after",
        ].join("\n"),
      },
    };
    const opts: ToolRenderResultOptions = { expanded: true, isPartial: false };
    t.assert.snapshot(renderBoth("edit", ctx.args, ctx, result, opts));
  });

  it("edit complete — large diff collapsed", (t) => {
    // Build a diff with many hunks that exceeds COLLAPSED_MAX_LINES
    const diffLines = [];
    for (let i = 1; i <= 8; i++) {
      diffLines.push(` ${i * 10} context`);
      diffLines.push(`-${i * 10 + 1} old line ${i}`);
      diffLines.push(`+${i * 10 + 1} new line ${i}`);
      diffLines.push(` ${i * 10 + 2} context`);
      if (i < 8) diffLines.push(`  ${"".padStart(2)} ...`);
    }
    const ctx = createRenderContext({
      isPartial: false,
      executionStarted: true,
      argsComplete: true,
      args: { path: "big.ts" },
    });
    const result: AgentToolResult<any> = {
      content: [{ type: "text", text: "Successfully edited big.ts" }],
      details: { diff: diffLines.join("\n") },
    };
    const opts: ToolRenderResultOptions = { expanded: false, isPartial: false };
    t.assert.snapshot(renderBoth("edit", ctx.args, ctx, result, opts));
  });

  it("edit complete — large diff expanded", (t) => {
    const diffLines = [];
    for (let i = 1; i <= 8; i++) {
      diffLines.push(` ${i * 10} context`);
      diffLines.push(`-${i * 10 + 1} old line ${i}`);
      diffLines.push(`+${i * 10 + 1} new line ${i}`);
      diffLines.push(` ${i * 10 + 2} context`);
      if (i < 8) diffLines.push(`  ${"".padStart(2)} ...`);
    }
    const ctx = createRenderContext({
      isPartial: false,
      executionStarted: true,
      argsComplete: true,
      expanded: true,
      args: { path: "big.ts" },
    });
    const result: AgentToolResult<any> = {
      content: [{ type: "text", text: "Successfully edited big.ts" }],
      details: { diff: diffLines.join("\n") },
    };
    const opts: ToolRenderResultOptions = { expanded: true, isPartial: false };
    t.assert.snapshot(renderBoth("edit", ctx.args, ctx, result, opts));
  });

  it("edit complete — large line numbers (padding)", (t) => {
    const ctx = createRenderContext({
      isPartial: false,
      executionStarted: true,
      argsComplete: true,
      args: { path: "test.ts", oldText: "old", newText: "new" },
    });
    const result: AgentToolResult<any> = {
      content: [{ type: "text", text: "Successfully edited test.ts" }],
      details: {
        diff: [
          " 199 context before",
          "-200 old",
          "+200 new",
          " 201 context after",
        ].join("\n"),
      },
    };
    const opts: ToolRenderResultOptions = { expanded: false, isPartial: false };
    t.assert.snapshot(renderBoth("edit", ctx.args, ctx, result, opts));
  });

  // ─── Edit tool: replay ─────────────────────────────────────────────────

  it("edit replay — no preview diff in renderCall", (t) => {
    const ctx = createRenderContext({
      isPartial: false,
      executionStarted: false, // never set on replay
      argsComplete: true,
      args: { path: "test.ts", oldText: "foo", newText: "bar" },
    });
    const result: AgentToolResult<any> = {
      content: [{ type: "text", text: "Successfully edited test.ts" }],
      details: {
        diff: "- 1 foo\n+ 1 bar",
      },
    };
    const opts: ToolRenderResultOptions = { expanded: false, isPartial: false };
    t.assert.snapshot(renderBoth("edit", ctx.args, ctx, result, opts));
  });

  // ─── Write tool: partial streaming ─────────────────────────────────────

  it("write partial — file exists (diff against old content)", (t) => {
    const filePath = join(tmpDir, "write-exists.ts");
    writeFileSync(filePath, "old line1\nold line2\nold line3\n", "utf-8");

    const ctx = createRenderContext({
      isPartial: true,
      executionStarted: false,
      argsComplete: false,
      state: {},
      args: {
        path: "write-exists.ts",
        content: "new line1\nold line2\nold line3\n",
      },
    });
    const result: AgentToolResult<any> = { content: [], details: undefined };
    const opts: ToolRenderResultOptions = { expanded: false, isPartial: true };
    t.assert.snapshot(renderBoth("write", ctx.args, ctx, result, opts));
  });

  it("write partial — file does not exist (all additions)", (t) => {
    const ctx = createRenderContext({
      isPartial: true,
      executionStarted: false,
      argsComplete: false,
      state: {},
      args: { path: "write-new-file.ts", content: "line1\nline2\nline3" },
    });
    const result: AgentToolResult<any> = { content: [], details: undefined };
    const opts: ToolRenderResultOptions = { expanded: false, isPartial: true };
    t.assert.snapshot(renderBoth("write", ctx.args, ctx, result, opts));
  });

  it("write partial — large file rewrite, streaming frontier", (t) => {
    // Simulate: 30-line file being rewritten with scattered changes.
    // New content has streamed ~15 lines so far. The frontier should be
    // where the streamed content ends and remaining old-file removals begin.
    const oldLines = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
    const newLines = oldLines
      .slice(0, 15)
      .map((l, i) => (i === 3 || i === 10 ? l.replace("line", "EDITED") : l));
    const filePath = join(tmpDir, "write-frontier.ts");
    writeFileSync(filePath, oldLines.join("\n") + "\n", "utf-8");

    const ctx = createRenderContext({
      isPartial: true,
      executionStarted: false,
      argsComplete: false,
      state: {},
      args: { path: "write-frontier.ts", content: newLines.join("\n") },
    });
    const result: AgentToolResult<any> = { content: [], details: undefined };
    const opts: ToolRenderResultOptions = { expanded: false, isPartial: true };
    t.assert.snapshot(renderBoth("write", ctx.args, ctx, result, opts));
  });

  it("write partial — content still streaming (no content yet)", (t) => {
    const ctx = createRenderContext({
      isPartial: true,
      executionStarted: false,
      argsComplete: false,
      state: {},
      args: { path: "some-file.ts" },
    });
    const result: AgentToolResult<any> = { content: [], details: undefined };
    const opts: ToolRenderResultOptions = { expanded: false, isPartial: true };
    t.assert.snapshot(renderBoth("write", ctx.args, ctx, result, opts));
  });

  // ─── Write tool: replay ────────────────────────────────────────────────

  it("write replay — shows file listing (cannot recover old content)", (t) => {
    const ctx = createRenderContext({
      isPartial: false,
      executionStarted: false,
      argsComplete: true,
      state: {},
      args: {
        path: "replayed.ts",
        content: "replay line1\nreplay line2\nreplay line3",
      },
    });
    const result: AgentToolResult<any> = {
      content: [
        { type: "text", text: "Successfully wrote 50 bytes to replayed.ts" },
      ],
      details: undefined,
    };
    const opts: ToolRenderResultOptions = { expanded: false, isPartial: false };
    t.assert.snapshot(renderBoth("write", ctx.args, ctx, result, opts));
  });

  it("write replay expanded — shows all file content", (t) => {
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
    const content = lines.join("\n");
    const ctx = createRenderContext({
      isPartial: false,
      executionStarted: false,
      argsComplete: true,
      expanded: true,
      state: {},
      args: { path: "big-file.ts", content },
    });
    const result: AgentToolResult<any> = {
      content: [{ type: "text", text: "Successfully wrote 200 bytes" }],
      details: undefined,
    };
    const opts: ToolRenderResultOptions = { expanded: true, isPartial: false };
    t.assert.snapshot(renderBoth("write", ctx.args, ctx, result, opts));
  });

  it("write replay collapsed — truncates long file", (t) => {
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
    const content = lines.join("\n");
    const ctx = createRenderContext({
      isPartial: false,
      executionStarted: false,
      argsComplete: true,
      state: {},
      args: { path: "big-file.ts", content },
    });
    const result: AgentToolResult<any> = {
      content: [{ type: "text", text: "Successfully wrote 200 bytes" }],
      details: undefined,
    };
    const opts: ToolRenderResultOptions = { expanded: false, isPartial: false };
    t.assert.snapshot(renderBoth("write", ctx.args, ctx, result, opts));
  });

  // ─── Write tool: renderResult always empty ─────────────────────────────

  it("write renderResult — always empty (suppresses built-in)", () => {
    const writeTool = tools["write"];
    const result: AgentToolResult<any> = {
      content: [{ type: "text", text: "Successfully wrote 100 bytes" }],
      details: undefined,
    };
    const opts: ToolRenderResultOptions = { expanded: false, isPartial: false };
    const component = writeTool.renderResult!(result, opts, theme, {} as any);
    assert.strictEqual(renderText(component), "", "should return empty text");
  });
});
