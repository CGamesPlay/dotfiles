import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import {
  createTestSession,
  says,
  type TestSession,
} from "../../../test-harness/index.js";

describe("presets system prompt", () => {
  let t: TestSession;
  let tmpDir: string | undefined;

  afterEach(async () => {
    t?.dispose();
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("default system prompt contains the <project_context> block when an AGENTS.md is present", async () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "presets-prompt-"));
    writeFileSync(path.join(tmpDir, "AGENTS.md"), "# Test project\n");

    let captured: string | undefined;

    t = await createTestSession({
      cwd: tmpDir,
      mockTools: { bash: "ok", read: "ok", write: "ok", edit: "ok" },
      onStreamFnCall: (context) => {
        if (captured === undefined) captured = context.systemPrompt;
      },
    });

    await t.turn("hi", [says("hello")]);

    assert.ok(
      captured !== undefined,
      "expected streamFn to be called at least once",
    );
    assert.ok(
      captured!.includes("<project_context>"),
      `system prompt missing "<project_context>" anchor:\n${captured}`,
    );
  });
});
