import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildSubagentArgs } from "../tools/subagent.js";
import type { ResolvedPreset } from "../lib/presets.js";

const RESOLVED: ResolvedPreset = {
  provider: "claude-agent-sdk",
  model: "claude-haiku-4-5",
  thinkingLevel: "off",
  preset: "small",
  group: "claude",
  ref: "claude/small",
};

describe("buildSubagentArgs", () => {
  it("passes the qualified preset ref via --preset", () => {
    const args = buildSubagentArgs(RESOLVED, {}, undefined, undefined);
    const i = args.indexOf("--preset");
    assert.notEqual(i, -1, "--preset must be present");
    assert.equal(args[i + 1], "claude/small");
  });

  it("does not expand --model or --thinking", () => {
    const args = buildSubagentArgs(RESOLVED, {}, undefined, undefined);
    assert.ok(!args.includes("--model"), "--model must not be passed");
    assert.ok(!args.includes("--thinking"), "--thinking must not be passed");
  });

  it("includes the base print-mode flags", () => {
    const args = buildSubagentArgs(RESOLVED, {}, undefined, undefined);
    for (const flag of ["--mode", "json", "-p", "--no-session"]) {
      assert.ok(args.includes(flag), `expected ${flag}`);
    }
  });

  it("appends trust, tools, and remote when provided", () => {
    const args = buildSubagentArgs(
      RESOLVED,
      { tools: ["read", "grep"] },
      "--approve",
      "ssh host",
    );
    assert.ok(args.includes("--approve"));
    const t = args.indexOf("--tools");
    assert.equal(args[t + 1], "read,grep");
    const r = args.indexOf("--remote");
    assert.equal(args[r + 1], "ssh host");
  });
});
