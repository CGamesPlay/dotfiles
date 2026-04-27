/**
 * Completion Mode — E2E Tests
 *
 * Covers the --completion path: set_command tool registration, the accepted
 * branch (UI confirm true → "Command accepted"), and the iteration branch
 * (UI confirm false → "waiting for changes or /accept").
 *
 * The extension gates set_command registration on `process.argv.includes
 * ("--completion")` because flag values are applied after extension load.
 * Tests mutate process.argv around boot to exercise both states.
 */

import { describe, it, afterEach, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  createTestSession,
  calls,
  says,
  type TestSession,
} from "../../../test-harness/index.js";

const EXTENSION = path.resolve(import.meta.dirname, "../index.ts");

describe("completion mode e2e", () => {
  let t: TestSession | undefined;
  const originalArgv = process.argv;

  afterEach(async () => {
    await t?.waitForIdle();
    t?.dispose();
    t = undefined;
  });

  describe("with --completion flag", () => {
    before(() => {
      process.argv = [...originalArgv, "--completion"];
    });
    after(() => {
      process.argv = originalArgv;
    });

    it("registers the set_command tool", async () => {
      t = await createTestSession({ extensions: [EXTENSION] });
      const toolNames = t.session.getAllTools().map((tool: any) => tool.name);
      assert.ok(
        toolNames.includes("set_command"),
        `set_command not registered. tools: ${toolNames.join(", ")}`,
      );
    });

    it("returns 'Command accepted' when UI confirms", async () => {
      t = await createTestSession({
        extensions: [EXTENSION],
        mockUI: { confirm: true },
      });

      await t.turn("Build me an ls command", [
        calls("set_command", { command: "ls -la" }),
        says("Done."),
      ]);

      const results = t.events.toolResultsFor("set_command");
      assert.equal(results.length, 1);
      assert.match(
        results[0].text,
        /Command accepted: ls -la/,
        `expected accepted text, got: ${results[0].text}`,
      );

      // Confirm dialog was shown with the proposed command as the message.
      const confirmCalls = t.events.uiCallsFor("confirm");
      assert.equal(confirmCalls.length, 1);
      assert.equal(confirmCalls[0].args[0], "📋 Accept command?");
      assert.equal(confirmCalls[0].args[1], "ls -la");
    });

    it("returns iteration text when UI rejects", async () => {
      t = await createTestSession({
        extensions: [EXTENSION],
        mockUI: { confirm: false },
      });

      await t.turn("Build me an ls command", [
        calls("set_command", { command: "ls -la" }),
        says("Awaiting iteration."),
      ]);

      const results = t.events.toolResultsFor("set_command");
      assert.equal(results.length, 1);
      assert.match(
        results[0].text,
        /waiting for changes or \/accept/,
        `expected iteration text, got: ${results[0].text}`,
      );
    });
  });

  describe("without --completion flag", () => {
    it("does not register the set_command tool", async () => {
      // Sanity: no --completion in argv (the test runner's argv doesn't include it).
      assert.ok(!process.argv.includes("--completion"));

      t = await createTestSession({ extensions: [EXTENSION] });
      const toolNames = t.session.getAllTools().map((tool: any) => tool.name);
      assert.ok(
        !toolNames.includes("set_command"),
        `set_command should not be registered. tools: ${toolNames.join(", ")}`,
      );
    });
  });
});
