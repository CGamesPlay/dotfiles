import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createTestSession, calls, says, type TestSession } from "./index.js";

const EXTENSION = path.resolve(
  import.meta.dirname,
  "../extensions/session-state/index.ts",
);

describe("harness smoke", () => {
  let t: TestSession;
  afterEach(() => t?.dispose());

  it("boots with the session-state extension and runs a turn", async () => {
    t = await createTestSession({
      extensions: [EXTENSION],
      mockTools: { bash: "ok", read: "ok", write: "ok", edit: "ok" },
    });

    await t.turn("hi", [says("hello")]);

    assert.equal(t.events.toolCalls.length, 0);
    assert.ok(t.events.messages.length >= 1);
  });

  it("records a mocked tool call", async () => {
    t = await createTestSession({
      extensions: [EXTENSION],
      mockTools: { bash: "ok", read: "ok", write: "ok", edit: "ok" },
    });

    await t.turn("write a file", [
      calls("write", { path: "/tmp/x", content: "y" }),
      says("done"),
    ]);

    const results = t.events.toolResultsFor("write");
    assert.equal(results.length, 1);
    assert.equal(results[0].mocked, true);
  });
});
