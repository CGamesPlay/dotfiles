import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  renderCollapsed,
  type RenderTaskResult,
} from "../lib/subagent-render.js";

const T0 = 1_700_000_000_000; // fixed "start" epoch
const T_LATER = T0 + 3_000; // +3 seconds

function completedTask(
  overrides: Partial<RenderTaskResult> = {},
): RenderTaskResult {
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
    // Real subagents produce displayItems that include the assistant's final
    // text — the renderer must NOT echo that same text from displayItems and
    // also from finalOutput, or the body shows up twice.
    displayItems: [{ type: "text", text: "1, 2, 3" }],
    finalOutput: "1, 2, 3",
    ...overrides,
  };
}

describe("subagent renderCollapsed", () => {
  it("renders three completed parallel tasks (Ryan example #1)", () => {
    const results = [completedTask(), completedTask(), completedTask()];
    const lines = renderCollapsed(results, T_LATER);
    assert.equal(
      lines.join("\n"),
      [
        "✓ subagent parallel (3 tasks)",
        "",
        "─── general-purpose ✓",
        "Task: Count to 3 and output the numbers 1, 2, 3.",
        "1, 2, 3",
        "1 turn ↑2 ↓62 R4.5k ctx:4.6k ⏱ 0:03 mid",
        "",
        "─── general-purpose ✓",
        "Task: Count to 3 and output the numbers 1, 2, 3.",
        "1, 2, 3",
        "1 turn ↑2 ↓62 R4.5k ctx:4.6k ⏱ 0:03 mid",
        "",
        "─── general-purpose ✓",
        "Task: Count to 3 and output the numbers 1, 2, 3.",
        "1, 2, 3",
        "1 turn ↑2 ↓62 R4.5k ctx:4.6k ⏱ 0:03 mid",
        "",
        "Total: 3 turns ↑6 ↓186 R14k ⏱ 0:03",
      ].join("\n"),
    );
  });

  it("renders a running single subagent with no output (Ryan example #2)", () => {
    const result: RenderTaskResult = {
      agent: "general-purpose",
      task: "Run 10 separate bash commands: echo one, echo two, echo three, echo four, echo five, ...",
      exitCode: -1,
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        cost: 0,
        contextTokens: 0,
        turns: 0,
      },
      startedAt: T0,
      provider: "zai",
      model: "glm-4.7",
      thinkingLevel: "off",
      displayItems: [],
    };
    const lines = renderCollapsed([result], T0);
    // While running with no displayItems the body is "(no output)".
    // Footer carries a zeroed token counter and the live clock at 0:00.
    assert.equal(
      lines.join("\n"),
      [
        "⏳ subagent general-purpose",
        "",
        "Task: Run 10 separate bash commands: echo one, echo two, echo three, echo four, echo five, ...",
        "(no output)",
        "0 turns ↑0 ↓0 R0 ctx:0 ⏱ 0:00 (zai) glm-4.7 • thinking off",
        "",
        "Total: 0 turns ↑0 ↓0 R0 ⏱ 0:00",
      ].join("\n"),
    );
  });

  it("uses preset name verbatim when set, else (provider) model • thinking", () => {
    const r1 = completedTask({ presetName: "mid" });
    assert.equal(r1.presetName, "mid");
    const lines1 = renderCollapsed([r1], T_LATER);
    assert.match(lines1.join("\n"), / mid$/m);

    const r2 = completedTask({
      presetName: undefined,
      provider: "zai",
      model: "glm-4.5-air",
      thinkingLevel: "off",
    });
    const lines2 = renderCollapsed([r2], T_LATER);
    assert.match(lines2.join("\n"), /\(zai\) glm-4\.5-air • thinking off/);

    const r3 = completedTask({
      presetName: undefined,
      provider: "anthropic",
      model: "claude-opus-4-7",
      thinkingLevel: "high",
    });
    const lines3 = renderCollapsed([r3], T_LATER);
    assert.match(lines3.join("\n"), /\(anthropic\) claude-opus-4-7 • high/);
  });

  it("shows ⏳ for in-progress tasks and ✓ only for completed ones", () => {
    const running = completedTask({ exitCode: -1, endedAt: undefined });
    const done = completedTask({ exitCode: 0 });
    const lines = renderCollapsed([running, done], T_LATER);
    const text = lines.join("\n");
    // First section is running, second is done.
    const sections = text.split("\n\n");
    assert.match(sections[1], /─── general-purpose ⏳/);
    assert.match(sections[2], /─── general-purpose ✓/);
    // Header reflects running.
    assert.match(sections[0], /^⏳ subagent parallel/);
  });

  it("uses wall-clock for the Total line (not summed agent time)", () => {
    // Two tasks, each ran 3s, but in parallel — wall clock should be 3s, not 6s.
    const r1 = completedTask({ startedAt: T0, endedAt: T0 + 3_000 });
    const r2 = completedTask({ startedAt: T0 + 500, endedAt: T0 + 2_500 });
    const lines = renderCollapsed([r1, r2], T0 + 3_000);
    const total = lines[lines.length - 1];
    assert.match(total, /⏱ 0:03/);
  });

  it("does not duplicate the final output when displayItems also contains it", () => {
    // Reproduces the bug Ryan saw: assistant text shows up both in
    // displayItems (because the agent emitted it as a streamed message) and
    // again as finalOutput. The collapsed view should only render it once.
    const r = completedTask({
      displayItems: [
        {
          type: "toolCall",
          name: "bash",
          argsPreview: '{"command":"echo hi"}',
        },
        { type: "text", text: "Hi Ryan!\n\n1, 2, 3" },
      ],
      finalOutput: "Hi Ryan!\n\n1, 2, 3",
    });
    const text = renderCollapsed([r], T_LATER).join("\n");
    const occurrences = text.split("Hi Ryan!").length - 1;
    assert.equal(
      occurrences,
      1,
      `expected the final output to appear exactly once, got ${occurrences}:\n${text}`,
    );
  });

  it("surfaces recent tool calls in the collapsed view", () => {
    const r = completedTask({
      displayItems: [
        { type: "toolCall", name: "bash", argsPreview: '{"command":"echo 1"}' },
        { type: "toolCall", name: "bash", argsPreview: '{"command":"echo 2"}' },
        { type: "text", text: "1, 2, 3" },
      ],
      finalOutput: "1, 2, 3",
    });
    const text = renderCollapsed([r], T_LATER).join("\n");
    assert.match(text, /→ bash \{"command":"echo 1"\}/);
    assert.match(text, /→ bash \{"command":"echo 2"\}/);
  });

  it("ticks the live clock based on `now` while a task is still running", () => {
    const running = completedTask({ exitCode: -1, endedAt: undefined });
    const at5s = renderCollapsed([running], T0 + 5_000).join("\n");
    const at10s = renderCollapsed([running], T0 + 10_000).join("\n");
    assert.match(at5s, /⏱ 0:05/);
    assert.match(at10s, /⏱ 0:10/);
  });
});
