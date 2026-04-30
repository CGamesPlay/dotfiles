/**
 * Unit tests for the MCP server's tool_use_id extraction.
 *
 * The id lives at `_meta["claudecode/toolUseId"]` — an undocumented,
 * namespaced key in the SDK's `extra` argument. If the SDK ever renames
 * this key, every tool call would land with no id and silently collapse
 * into one shared deferred. These tests pin the contract so a future SDK
 * upgrade that breaks it fails loudly.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractToolUseId } from "../src/pi-mcp-server.js";

describe("extractToolUseId", () => {
  it("returns the id from _meta['claudecode/toolUseId']", () => {
    const extra = {
      signal: new AbortController().signal,
      _meta: { "claudecode/toolUseId": "toolu_abc123", progressToken: 1 },
      requestId: 1,
    };
    assert.equal(extractToolUseId(extra), "toolu_abc123");
  });

  it("throws when extra is undefined", () => {
    assert.throws(() => extractToolUseId(undefined), /tool_use_id/);
  });

  it("throws when _meta is missing", () => {
    assert.throws(
      () => extractToolUseId({ signal: new AbortController().signal }),
      /tool_use_id/,
    );
  });

  it("throws when the key is missing from _meta", () => {
    assert.throws(
      () => extractToolUseId({ _meta: { progressToken: 1 } }),
      /tool_use_id/,
    );
  });

  it("throws when the value is empty string (would silently collapse deferreds)", () => {
    assert.throws(
      () => extractToolUseId({ _meta: { "claudecode/toolUseId": "" } }),
      /tool_use_id/,
    );
  });

  it("throws when the value is a non-string type", () => {
    assert.throws(
      () => extractToolUseId({ _meta: { "claudecode/toolUseId": 42 } }),
      /tool_use_id/,
    );
  });

  it("error message includes the actual extra so future-us can see what changed", () => {
    const sentinel = "claude-agent-sdk-renamed-this-key";
    try {
      extractToolUseId({ _meta: { [sentinel]: "toolu_xyz" } });
      assert.fail("expected throw");
    } catch (err) {
      assert.match((err as Error).message, new RegExp(sentinel));
    }
  });
});
