import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import {
  clearPresetsCache,
  findGroupForModel,
  getAllRefs,
  getDefaultGroup,
  getDefaultPresetRef,
  nextPreset,
  prevPreset,
  resolvePreset,
  setPresetsBaseDir,
} from "../lib/presets.js";

/**
 * Test config: two groups, default = zai. zai has small/mid/large; claude has
 * small/mid only (so "large" only exists in zai).
 */
const CONFIG = {
  default: "zai/mid",
  presets: {
    claude: {
      small: {
        provider: "claude-agent-sdk",
        model: "claude-haiku",
        thinkingLevel: "off",
      },
      mid: {
        provider: "claude-agent-sdk",
        model: "claude-sonnet",
        thinkingLevel: "low",
      },
    },
    zai: {
      small: { provider: "zai", model: "glm-air", thinkingLevel: "off" },
      mid: { provider: "zai", model: "glm", thinkingLevel: "low" },
      large: { provider: "zai", model: "glm-max", thinkingLevel: "low" },
    },
  },
} as const;

describe("presets", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "presets-test-"));
    mkdirSync(path.join(tmpDir, ".pi", "agent"), { recursive: true });
    writeFileSync(
      path.join(tmpDir, ".pi", "agent", "presets.json"),
      JSON.stringify(CONFIG),
      { encoding: "utf-8" },
    );
  });

  beforeEach(() => {
    setPresetsBaseDir(tmpDir);
  });

  afterEach(async () => {
    clearPresetsCache();
    setPresetsBaseDir(undefined);
    await rm(tmpDir, { recursive: true, force: true });
  });

  // ─── Qualified refs (strict group/model order) ──────────────────────────

  describe("qualified refs", () => {
    it("resolves a valid group/model ref", async () => {
      const r = await resolvePreset("zai/mid");
      assert.ok(r, "expected zai/mid to resolve");
      assert.equal(r!.provider, "zai");
      assert.equal(r!.model, "glm");
      assert.equal(r!.preset, "mid");
      assert.equal(r!.group, "zai");
      assert.equal(r!.ref, "zai/mid");
      assert.equal(r!.thinkingLevel, "low");
    });

    it("rejects the reverse model/group order", async () => {
      // "mid/zai" looks unambiguous but the order is wrong -> rejected.
      assert.equal(await resolvePreset("mid/zai"), undefined);
    });

    it("returns undefined for unknown group", async () => {
      assert.equal(await resolvePreset("foo/mid"), undefined);
    });

    it("returns undefined for unknown model in a known group", async () => {
      assert.equal(await resolvePreset("zai/huge"), undefined);
    });

    it("returns undefined for 3-part refs", async () => {
      assert.equal(await resolvePreset("a/b/c"), undefined);
    });

    it("returns undefined for empty ref", async () => {
      assert.equal(await resolvePreset(""), undefined);
    });
  });

  // ─── Bare refs ──────────────────────────────────────────────────────────

  describe("bare refs", () => {
    it("resolve against the default group when no override given", async () => {
      const r = await resolvePreset("mid");
      assert.ok(r, "expected bare 'mid' to resolve");
      assert.equal(r!.group, "zai");
      assert.equal(r!.ref, "zai/mid");
    });

    it("resolve against an explicit group override", async () => {
      const r = await resolvePreset("small", "claude");
      assert.ok(r);
      assert.equal(r!.group, "claude");
      assert.equal(r!.ref, "claude/small");
      assert.equal(r!.provider, "claude-agent-sdk");
    });

    it("group override is ignored for qualified refs", async () => {
      // zai/mid stays zai even when override says claude.
      const r = await resolvePreset("zai/mid", "claude");
      assert.ok(r);
      assert.equal(r!.group, "zai");
    });

    it("returns undefined when the model isn't in the override group", async () => {
      // "large" only exists in zai, not claude.
      assert.equal(await resolvePreset("large", "claude"), undefined);
    });
  });

  // ─── No default configured ───────────────────────────────────────────────

  describe("without a default", () => {
    beforeEach(() => {
      // Rewrite config without a default.
      const { default: _drop, ...rest } = CONFIG as any;
      void _drop;
      writeFileSync(
        path.join(tmpDir, ".pi", "agent", "presets.json"),
        JSON.stringify({ presets: rest.presets }),
        { encoding: "utf-8" },
      );
      clearPresetsCache();
    });

    it("bare name fails when no default and no override", async () => {
      assert.equal(await resolvePreset("mid"), undefined);
    });

    it("bare name still resolves with an explicit override", async () => {
      const r = await resolvePreset("mid", "claude");
      assert.ok(r);
      assert.equal(r!.ref, "claude/mid");
    });

    it("getDefaultGroup is undefined", async () => {
      assert.equal(await getDefaultGroup(), undefined);
    });
  });

  // ─── Listing & defaults ──────────────────────────────────────────────────

  describe("listing & defaults", () => {
    it("getAllRefs returns insertion-order normalized refs", async () => {
      assert.deepEqual(await getAllRefs(), [
        "claude/small",
        "claude/mid",
        "zai/small",
        "zai/mid",
        "zai/large",
      ]);
    });

    it("getDefaultPresetRef returns the canonical default", async () => {
      assert.equal(await getDefaultPresetRef(), "zai/mid");
    });

    it("getDefaultGroup returns the default's group", async () => {
      assert.equal(await getDefaultGroup(), "zai");
    });
  });

  // ─── findGroupForModel ───────────────────────────────────────────────────

  describe("findGroupForModel", () => {
    it("finds the group for a known provider+model", async () => {
      assert.equal(await findGroupForModel("zai", "glm"), "zai");
      assert.equal(await findGroupForModel("zai", "glm-air"), "zai");
      assert.equal(
        await findGroupForModel("claude-agent-sdk", "claude-sonnet"),
        "claude",
      );
    });

    it("returns undefined for an unknown model", async () => {
      assert.equal(await findGroupForModel("zai", "nope"), undefined);
      assert.equal(await findGroupForModel("foo", "bar"), undefined);
    });
  });

  // ─── Cycling ────────────────────────────────────────────────────────────

  describe("cycling", () => {
    // Insertion-order refs: groups in JSON order (claude before zai); within a
    // group, models in JSON order (size tiers small/mid/large).
    const refs = [
      "claude/small",
      "claude/mid",
      "zai/small",
      "zai/mid",
      "zai/large",
    ];

    it("nextPreset wraps around", async () => {
      assert.equal(await nextPreset(undefined), "claude/small");
      assert.equal(await nextPreset("zai/large"), "claude/small"); // wrap
      assert.equal(await nextPreset("claude/small"), "claude/mid");
      // Unknown current restarts at the first.
      assert.equal(await nextPreset("nope"), "claude/small");
    });

    it("prevPreset wraps around", async () => {
      assert.equal(await prevPreset(undefined), "zai/large");
      assert.equal(await prevPreset("claude/small"), "zai/large"); // wrap
      assert.equal(await prevPreset("zai/mid"), "zai/small");
    });

    it("cycles through all refs", async () => {
      let cur = await nextPreset(undefined);
      const visited: string[] = [cur!];
      for (let i = 0; i < refs.length - 1; i++) {
        cur = await nextPreset(cur);
        visited.push(cur!);
      }
      assert.deepEqual(visited, refs);
    });
  });

  // ─── Subagent session-following composition ──────────────────────────────

  describe("subagent session-following", () => {
    /**
     * Reproduce how tools/subagent.ts picks a subagent's group: derive the main
     * session's group from its current model (falling back to the default), then
     * resolve the agent's raw preset against it.
     */
    async function resolveForSession(
      rawPreset: string,
      provider?: string,
      modelId?: string,
    ) {
      const group =
        (provider && modelId
          ? await findGroupForModel(provider, modelId)
          : undefined) ?? (await getDefaultGroup());
      return resolvePreset(rawPreset, group);
    }

    it("bare preset follows the session's provider (zai)", async () => {
      // Session running glm (zai mid).
      const r = await resolveForSession("small", "zai", "glm");
      assert.ok(r);
      assert.equal(r!.ref, "zai/small");
      assert.equal(r!.provider, "zai");
    });

    it("bare preset follows the session after switching providers", async () => {
      // Session switches to claude sonnet.
      const r = await resolveForSession(
        "small",
        "claude-agent-sdk",
        "claude-sonnet",
      );
      assert.ok(r);
      assert.equal(r!.ref, "claude/small");
      assert.equal(r!.provider, "claude-agent-sdk");
    });

    it("qualified preset is independent of the session", async () => {
      // Even on a zai session, claude/large... but claude has no large.
      assert.equal(
        await resolveForSession("claude/large", "zai", "glm"),
        undefined,
      );
      // claude/mid resolves regardless of session group.
      const r = await resolveForSession("claude/mid", "zai", "glm");
      assert.ok(r);
      assert.equal(r!.ref, "claude/mid");
    });

    it("falls back to the default group when the session model is unknown", async () => {
      const r = await resolveForSession("mid", "foo", "bar");
      assert.ok(r);
      assert.equal(r!.group, "zai");
    });
  });
});
