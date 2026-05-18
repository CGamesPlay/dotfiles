/**
 * Session Storage — replay logic tests
 *
 * Tests the pure in-memory replay: given a branch of session entries,
 * compute the final file state (Map<path, content>).
 * No filesystem access — we test extractSessionStorageOps + replayOperations
 * via the computeSessionStorageState convenience function.
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { computeSessionStorageState } from "../lib/session-storage.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type {
  SessionEntry,
  SessionMessageEntry,
  CustomEntry,
  CompactionEntry,
  BranchSummaryEntry,
} from "@earendil-works/pi-coding-agent";
import {
  createTestSession,
  calls,
  says,
  type TestSession,
} from "../../../test-harness/index.js";

// ─── Test Helpers ──────────────────────────────────────────────────────────────

const CWD = "/workspaces/pi-test";
// Unit tests use a fixed session dir path (not derived from session manager)
const SESSION_DIR = "/tmp/test-sessions/test-session-id";

/** Helper: session-relative path for tool call arguments */
function sp(filename: string): string {
  return path.join(SESSION_DIR, filename);
}

/** Helper: expected absolute path in the result map */
function ep(filename: string): string {
  return path.resolve(SESSION_DIR, filename);
}

let idCounter = 0;
function nextId(): string {
  return `entry-${++idCounter}`;
}

function resetIds(): void {
  idCounter = 0;
}

/** Create an assistant message entry containing tool calls */
function makeAssistantEntry(
  id: string,
  parentId: string | null,
  toolCalls: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>,
): SessionMessageEntry {
  return {
    type: "message",
    id,
    parentId,
    timestamp: new Date().toISOString(),
    message: {
      role: "assistant",
      content: toolCalls.map((tc) => ({
        type: "toolCall" as const,
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments,
      })),
      api: "anthropic-messages" as any,
      provider: "anthropic" as any,
      model: "test",
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "toolUse" as const,
      timestamp: Date.now(),
    },
  };
}

/** Create a tool result entry */
function makeToolResultEntry(
  id: string,
  parentId: string | null,
  toolCallId: string,
  toolName: string,
  isError = false,
): SessionMessageEntry {
  return {
    type: "message",
    id,
    parentId,
    timestamp: new Date().toISOString(),
    message: {
      role: "toolResult",
      toolCallId,
      toolName,
      content: [{ type: "text", text: isError ? "Error" : "OK" }],
      isError,
      timestamp: Date.now(),
    },
  };
}

/** Create a compaction entry */
function makeCompactionEntry(
  id: string,
  parentId: string | null,
  firstKeptEntryId: string,
): CompactionEntry {
  return {
    type: "compaction",
    id,
    parentId,
    timestamp: new Date().toISOString(),
    summary: "Compacted summary",
    firstKeptEntryId,
    tokensBefore: 1000,
  };
}

/** Create a user message entry */
function makeUserEntry(
  id: string,
  parentId: string | null,
  text: string,
): SessionMessageEntry {
  return {
    type: "message",
    id,
    parentId,
    timestamp: new Date().toISOString(),
    message: {
      role: "user",
      content: [{ type: "text", text }],
      timestamp: Date.now(),
    },
  };
}

/** Create a branch summary entry */
function makeBranchSummaryEntry(
  id: string,
  parentId: string | null,
  fromId: string,
): BranchSummaryEntry {
  return {
    type: "branch_summary",
    id,
    parentId,
    timestamp: new Date().toISOString(),
    fromId,
    summary: "Summary of the branch",
  };
}

/** Create a custom entry (e.g., session-storage-restore) */
function makeCustomEntry(
  id: string,
  parentId: string | null,
  customType: string,
  data: unknown,
): CustomEntry {
  return {
    type: "custom",
    id,
    parentId,
    timestamp: new Date().toISOString(),
    customType,
    data,
  };
}

/** Build a write tool call + result pair and append to branch */
function appendWrite(
  branch: SessionEntry[],
  parentId: string | null,
  filePath: string,
  content: string,
  options: { isError?: boolean } = {},
): { lastId: string; toolCallId: string } {
  const toolCallId = `tc-${nextId()}`;
  const assistantId = nextId();
  const resultId = nextId();

  branch.push(
    makeAssistantEntry(assistantId, parentId, [
      { id: toolCallId, name: "write", arguments: { path: filePath, content } },
    ]),
  );
  branch.push(
    makeToolResultEntry(
      resultId,
      assistantId,
      toolCallId,
      "write",
      options.isError,
    ),
  );
  return { lastId: resultId, toolCallId };
}

/** Build an edit (oldText/newText) tool call + result pair and append to branch */
function appendEdit(
  branch: SessionEntry[],
  parentId: string | null,
  filePath: string,
  oldText: string,
  newText: string,
  options: { isError?: boolean } = {},
): { lastId: string; toolCallId: string } {
  const toolCallId = `tc-${nextId()}`;
  const assistantId = nextId();
  const resultId = nextId();

  branch.push(
    makeAssistantEntry(assistantId, parentId, [
      {
        id: toolCallId,
        name: "edit",
        arguments: { path: filePath, oldText, newText },
      },
    ]),
  );
  branch.push(
    makeToolResultEntry(
      resultId,
      assistantId,
      toolCallId,
      "edit",
      options.isError,
    ),
  );
  return { lastId: resultId, toolCallId };
}

/** Build a multi-edit tool call + result pair and append to branch */
function appendMultiEdit(
  branch: SessionEntry[],
  parentId: string | null,
  filePath: string,
  edits: Array<{ oldText: string; newText: string }>,
  options: { isError?: boolean } = {},
): { lastId: string; toolCallId: string } {
  const toolCallId = `tc-${nextId()}`;
  const assistantId = nextId();
  const resultId = nextId();

  branch.push(
    makeAssistantEntry(assistantId, parentId, [
      { id: toolCallId, name: "edit", arguments: { path: filePath, edits } },
    ]),
  );
  branch.push(
    makeToolResultEntry(
      resultId,
      assistantId,
      toolCallId,
      "edit",
      options.isError,
    ),
  );
  return { lastId: resultId, toolCallId };
}

/** Create a minimal mock ExtensionContext with a getBranch stub */
function makeMockCtx(
  branchOverrides?: Map<string, SessionEntry[]>,
): ExtensionContext {
  return {
    cwd: CWD,
    sessionManager: {
      getBranch(fromId?: string): SessionEntry[] {
        if (fromId && branchOverrides?.has(fromId)) {
          return branchOverrides.get(fromId)!;
        }
        return [];
      },
    },
  } as unknown as ExtensionContext;
}

/** Compute state for a branch (shorthand) */
function compute(
  branch: SessionEntry[],
  ctx?: ExtensionContext,
): Map<string, string> {
  return computeSessionStorageState(
    branch,
    SESSION_DIR,
    CWD,
    ctx ?? makeMockCtx(),
  );
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("session-storage replay", () => {
  // Reset ID counter before each test for deterministic IDs
  // (node:test doesn't have beforeEach, so we reset at the start of each test)

  describe("write operations", () => {
    it("write to a new file produces the file in output", () => {
      const branch: SessionEntry[] = [];
      appendWrite(branch, null, sp("plan.md"), "# Plan\nStep 1");

      const result = compute(branch);

      assert.equal(result.size, 1);
      assert.equal(result.get(ep("plan.md")), "# Plan\nStep 1");
    });

    it("second write to the same file overwrites the first", () => {
      const branch: SessionEntry[] = [];
      const { lastId } = appendWrite(branch, null, sp("notes.md"), "first");
      appendWrite(branch, lastId, sp("notes.md"), "second");

      const result = compute(branch);

      assert.equal(result.size, 1);
      assert.equal(result.get(ep("notes.md")), "second");
    });

    it("writes to multiple files produces all files", () => {
      const branch: SessionEntry[] = [];
      const { lastId } = appendWrite(branch, null, sp("a.txt"), "aaa");
      appendWrite(branch, lastId, sp("b.txt"), "bbb");

      const result = compute(branch);

      assert.equal(result.size, 2);
      assert.equal(result.get(ep("a.txt")), "aaa");
      assert.equal(result.get(ep("b.txt")), "bbb");
    });
  });

  describe("edit operations", () => {
    it("edit with oldText/newText applies correctly", () => {
      const branch: SessionEntry[] = [];
      const { lastId } = appendWrite(
        branch,
        null,
        sp("file.txt"),
        "hello world",
      );
      appendEdit(branch, lastId, sp("file.txt"), "world", "universe");

      const result = compute(branch);

      assert.equal(result.get(ep("file.txt")), "hello universe");
    });

    it("edit with multi-edit format applies all replacements", () => {
      const branch: SessionEntry[] = [];
      const { lastId } = appendWrite(
        branch,
        null,
        sp("file.txt"),
        "the quick brown fox jumps over the lazy dog",
      );
      appendMultiEdit(branch, lastId, sp("file.txt"), [
        { oldText: "quick", newText: "slow" },
        { oldText: "lazy", newText: "energetic" },
      ]);

      const result = compute(branch);

      assert.equal(
        result.get(ep("file.txt")),
        "the slow brown fox jumps over the energetic dog",
      );
    });

    it("edit where oldText is not found is silently skipped", () => {
      const branch: SessionEntry[] = [];
      const { lastId } = appendWrite(branch, null, sp("file.txt"), "hello");
      appendEdit(branch, lastId, sp("file.txt"), "nonexistent", "replacement");

      const result = compute(branch);

      assert.equal(result.get(ep("file.txt")), "hello");
    });

    it("edit on a file with no prior write starts from empty string", () => {
      const branch: SessionEntry[] = [];
      appendEdit(branch, null, sp("file.txt"), "missing", "found");

      const result = compute(branch);

      // Edit tried to find "missing" in "", failed, result is ""
      assert.equal(result.get(ep("file.txt")), "");
    });
  });

  describe("error handling", () => {
    it("errored write is excluded from output", () => {
      const branch: SessionEntry[] = [];
      appendWrite(branch, null, sp("file.txt"), "content", { isError: true });

      const result = compute(branch);

      assert.equal(result.size, 0);
    });

    it("errored edit is excluded from output", () => {
      const branch: SessionEntry[] = [];
      const { lastId } = appendWrite(
        branch,
        null,
        sp("file.txt"),
        "hello world",
      );
      appendEdit(branch, lastId, sp("file.txt"), "world", "universe", {
        isError: true,
      });

      const result = compute(branch);

      // The write succeeded, the edit errored — file has original content
      assert.equal(result.get(ep("file.txt")), "hello world");
    });
  });

  describe("path filtering", () => {
    it("writes outside session dir are ignored", () => {
      const branch: SessionEntry[] = [];
      const { lastId } = appendWrite(
        branch,
        null,
        "/tmp/outside.txt",
        "ignored",
      );
      appendWrite(branch, lastId, sp("inside.txt"), "kept");

      const result = compute(branch);

      assert.equal(result.size, 1);
      assert.ok(result.has(ep("inside.txt")));
      assert.ok(!result.has("/tmp/outside.txt"));
    });

    it("absolute paths inside session dir are handled", () => {
      const branch: SessionEntry[] = [];
      const absPath = ep("abs.txt");
      appendWrite(branch, null, absPath, "absolute path content");

      const result = compute(branch);

      assert.equal(result.size, 1);
      assert.equal(result.get(absPath), "absolute path content");
    });
  });

  describe("compaction", () => {
    it("writes before and after compaction are both preserved", () => {
      const branch: SessionEntry[] = [];

      // Write a file
      const { lastId: writeResultId } = appendWrite(
        branch,
        null,
        sp("plan.md"),
        "# Plan\nOriginal",
      );

      // User message
      const userId = nextId();
      branch.push(makeUserEntry(userId, writeResultId, "do the next thing"));

      // Second write (after the user message)
      const { lastId: write2Id } = appendWrite(
        branch,
        userId,
        sp("notes.md"),
        "post-user notes",
      );

      // Compaction that compacts back to the user message
      const compactionId = nextId();
      branch.push(makeCompactionEntry(compactionId, write2Id, userId));

      const result = compute(branch);

      // Both writes should be present — compaction doesn't remove entries
      // from the parent chain, so session storage sees all of them
      assert.equal(result.size, 2);
      assert.equal(result.get(ep("plan.md")), "# Plan\nOriginal");
      assert.equal(result.get(ep("notes.md")), "post-user notes");
    });
  });

  describe("external modifications", () => {
    it("external-mod with string content replays as a write", () => {
      resetIds();
      const branch: SessionEntry[] = [];
      const { lastId } = appendWrite(branch, null, sp("plan.md"), "original");

      const modId = nextId();
      branch.push(
        makeCustomEntry(modId, lastId, "session-storage-external-mod", {
          path: sp("plan.md"),
          content: "externally modified",
        }),
      );

      const result = compute(branch);

      assert.equal(result.get(ep("plan.md")), "externally modified");
    });

    it("external-mod with base64 content decodes correctly", () => {
      resetIds();
      const branch: SessionEntry[] = [];

      const content = "binary-ish content: \x00\x01\x02";
      const b64 = Buffer.from(content, "utf-8").toString("base64");

      branch.push(
        makeCustomEntry(nextId(), null, "session-storage-external-mod", {
          path: sp("data.bin"),
          content: { base64: b64 },
        }),
      );

      const result = compute(branch);

      assert.equal(result.get(ep("data.bin")), content);
    });

    it("external-mod deletion removes file from output", () => {
      resetIds();
      const branch: SessionEntry[] = [];
      const { lastId } = appendWrite(branch, null, sp("plan.md"), "content");

      branch.push(
        makeCustomEntry(nextId(), lastId, "session-storage-external-mod", {
          path: sp("plan.md"),
          content: null,
        }),
      );

      const result = compute(branch);

      assert.equal(result.size, 0);
    });

    it("external-mod followed by edit applies correctly", () => {
      resetIds();
      const branch: SessionEntry[] = [];

      const modId = nextId();
      branch.push(
        makeCustomEntry(modId, null, "session-storage-external-mod", {
          path: sp("plan.md"),
          content: "hello world",
        }),
      );

      appendEdit(branch, modId, sp("plan.md"), "world", "universe");

      const result = compute(branch);

      assert.equal(result.get(ep("plan.md")), "hello universe");
    });

    it("deletion followed by write recreates the file", () => {
      resetIds();
      const branch: SessionEntry[] = [];
      const { lastId: writeId } = appendWrite(
        branch,
        null,
        sp("file.txt"),
        "v1",
      );

      const deleteId = nextId();
      branch.push(
        makeCustomEntry(deleteId, writeId, "session-storage-external-mod", {
          path: sp("file.txt"),
          content: null,
        }),
      );

      appendWrite(branch, deleteId, sp("file.txt"), "v2");

      const result = compute(branch);

      assert.equal(result.size, 1);
      assert.equal(result.get(ep("file.txt")), "v2");
    });
  });

  describe("branch summary", () => {
    it("handles nested branch summaries", () => {
      resetIds();

      // Inner summarized branch: has a write
      const innerBranch: SessionEntry[] = [];
      appendWrite(innerBranch, null, sp("inner.txt"), "inner content");
      const innerLeafId = "inner-leaf";

      // Outer summarized branch: has a write + branch_summary pointing to inner
      const outerBranch: SessionEntry[] = [];
      const { lastId: outerWriteId } = appendWrite(
        outerBranch,
        null,
        sp("outer.txt"),
        "outer content",
      );
      const outerSummaryId = nextId();
      outerBranch.push(
        makeBranchSummaryEntry(outerSummaryId, outerWriteId, innerLeafId),
      );
      const outerLeafId = "outer-leaf";
      const { lastId: _outerLastId } = appendWrite(
        outerBranch,
        outerSummaryId,
        sp("after-inner.txt"),
        "after inner",
      );

      // Current branch: branch_summary pointing to outer
      const currentBranch: SessionEntry[] = [];
      currentBranch.push(makeBranchSummaryEntry(nextId(), null, outerLeafId));
      appendWrite(
        currentBranch,
        currentBranch[0].id,
        sp("current.txt"),
        "current",
      );

      const branchOverrides = new Map<string, SessionEntry[]>();
      branchOverrides.set(innerLeafId, innerBranch);
      branchOverrides.set(outerLeafId, outerBranch);
      const ctx = makeMockCtx(branchOverrides);

      const result = computeSessionStorageState(
        currentBranch,
        SESSION_DIR,
        CWD,
        ctx,
      );

      // Should have: inner.txt (from inner branch), after-inner.txt (from outer branch
      // after its branch summary), and current.txt (from current branch)
      // outer.txt should NOT be present because the branch_summary in the outer
      // branch replaced the parent chain with inner branch
      assert.equal(result.size, 3);
      assert.equal(result.get(ep("inner.txt")), "inner content");
      assert.equal(result.get(ep("after-inner.txt")), "after inner");
      assert.equal(result.get(ep("current.txt")), "current");
    });
  });

  describe("session-storage-restore", () => {
    it("restores file content from a referenced branch", () => {
      // Build a "reference branch" — what getBranch(entryId) would return
      // for the branch that contains the file we want to restore
      const referenceBranch: SessionEntry[] = [];
      appendWrite(
        referenceBranch,
        null,
        sp("plan.md"),
        "# Accepted Plan\nDo the thing",
      );

      const restoreEntryId = "ref-leaf-id";

      const currentBranch: SessionEntry[] = [];
      const restoreCustomId = nextId();
      currentBranch.push(
        makeCustomEntry(restoreCustomId, null, "session-storage-restore", {
          entryId: restoreEntryId,
          path: sp("plan.md"),
        }),
      );

      const branchOverrides = new Map<string, SessionEntry[]>();
      branchOverrides.set(restoreEntryId, referenceBranch);
      const ctx = makeMockCtx(branchOverrides);

      const result = computeSessionStorageState(
        currentBranch,
        SESSION_DIR,
        CWD,
        ctx,
      );

      assert.equal(result.size, 1);
      assert.equal(result.get(ep("plan.md")), "# Accepted Plan\nDo the thing");
    });

    it("restore with nonexistent entryId is silently skipped", () => {
      const currentBranch: SessionEntry[] = [];
      currentBranch.push(
        makeCustomEntry(nextId(), null, "session-storage-restore", {
          entryId: "nonexistent-entry",
          path: sp("plan.md"),
        }),
      );

      // Mock ctx where getBranch throws for unknown entries
      const ctx = {
        cwd: CWD,
        sessionManager: {
          getBranch(fromId?: string): SessionEntry[] {
            if (fromId) throw new Error(`Entry ${fromId} not found`);
            return [];
          },
        },
      } as unknown as ExtensionContext;

      const result = computeSessionStorageState(
        currentBranch,
        SESSION_DIR,
        CWD,
        ctx,
      );

      assert.equal(result.size, 0);
    });

    it("restore applies before subsequent edits in the current branch", () => {
      // Reference branch has a file
      const referenceBranch: SessionEntry[] = [];
      appendWrite(referenceBranch, null, sp("plan.md"), "# Plan\nStep 1: foo");

      const restoreEntryId = "ref-leaf";
      const branchOverrides = new Map<string, SessionEntry[]>();
      branchOverrides.set(restoreEntryId, referenceBranch);

      const currentBranch: SessionEntry[] = [];
      const restoreId = nextId();
      currentBranch.push(
        makeCustomEntry(restoreId, null, "session-storage-restore", {
          entryId: restoreEntryId,
          path: sp("plan.md"),
        }),
      );

      appendEdit(currentBranch, restoreId, sp("plan.md"), "foo", "bar");

      const ctx = makeMockCtx(branchOverrides);
      const result = computeSessionStorageState(
        currentBranch,
        SESSION_DIR,
        CWD,
        ctx,
      );

      assert.equal(result.get(ep("plan.md")), "# Plan\nStep 1: bar");
    });
  });
});

// ─── Integration Tests (real pi session + real filesystem, via harness) ───────
//
// These tests run the session-state extension inside a real pi AgentSession
// driven by the test harness. The session's real `session_start` and
// `turn_end` hooks fire — which in turn call `resyncSessionStorage` and
// `detectExternalModifications`. Tests observe behavior via the on-disk
// contents of PI_SESSION_STORAGE and via `t.sessionManager.getBranch()` for
// custom session entries emitted by the extension.

const EXTENSION_PATH = path.resolve(import.meta.dirname, "../index.ts");

/** Mocks for pi's default tools except `write`, whose real implementation
 *  we need so the extension's internal-write tracking has a real file to
 *  snapshot. The `write` tool actually touches disk, which is what the
 *  extension's tool_call/tool_result hooks rely on. */
const MOCKS = {
  bash: "ok",
  read: "ok",
  edit: "ok",
} as const;

/** Collect external-mod custom entries from the session branch. */
function externalMods(t: TestSession): Array<Record<string, unknown>> {
  return t.sessionManager
    .getBranch()
    .filter(
      (e) =>
        e.type === "custom" &&
        (e as CustomEntry).customType === "session-storage-external-mod",
    )
    .map((e) => (e as CustomEntry).data as Record<string, unknown>);
}

describe("session-storage integration", () => {
  let tmpDir: string;
  let t: TestSession | undefined;

  afterEach(async () => {
    t?.dispose();
    t = undefined;
    delete process.env.PI_SESSION_STORAGE;
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  /** Build a fresh temp dir, point PI_SESSION_STORAGE into it, and boot the
   *  harness. session_start fires during createTestSession, so the env var
   *  must be set first. */
  async function boot(): Promise<{ storageDir: string }> {
    tmpDir = await mkdtemp(path.join(tmpdir(), "session-storage-test-"));
    const storageDir = path.join(tmpDir, ".session-storage");
    process.env.PI_SESSION_STORAGE = storageDir;
    t = await createTestSession({
      extensions: [EXTENSION_PATH],
      cwd: tmpDir,
      mockTools: MOCKS,
    });
    return { storageDir };
  }

  it("resync materializes files", async () => {
    const { storageDir } = await boot();

    await t!.turn("write plan.md", [
      calls("write", {
        path: path.join(storageDir, "plan.md"),
        content: "# My Plan",
      }),
      says("done"),
    ]);

    const content = await readFile(path.join(storageDir, "plan.md"), "utf-8");
    assert.equal(content, "# My Plan");
  });

  it("resync replays writes and edits in order", async () => {
    const { storageDir } = await boot();

    await t!.turn("make f.txt", [
      calls("write", {
        path: path.join(storageDir, "f.txt"),
        content: "hello world",
      }),
      calls("edit", {
        path: path.join(storageDir, "f.txt"),
        oldText: "world",
        newText: "universe",
      }),
      says("done"),
    ]);

    // session_tree isn't fired between turns automatically; force a fresh
    // resync by starting a new turn. But since the edit tool is mocked and
    // doesn't touch disk, the file reflects the replay state after next
    // session-lifecycle event. Trigger one via a no-op turn whose end runs
    // detectExternalModifications (which reconciles, but does not resync).
    // Instead, observe via computeSessionStorageState over the branch.
    const branch = t!.sessionManager.getBranch();
    const state = computeSessionStorageState(branch, storageDir, tmpDir, {
      sessionManager: t!.sessionManager,
      cwd: tmpDir,
    } as unknown as ExtensionContext);
    assert.equal(state.get(path.join(storageDir, "f.txt")), "hello universe");
  });

  it("branch summary preserves files from abandoned branch", async () => {
    const { storageDir } = await boot();
    const sm = t!.sessionManager;

    await t!.turn("first writes", [
      calls("write", { path: path.join(storageDir, "a.txt"), content: "aaa" }),
      says("a done"),
    ]);
    const afterFirstWrite = sm.getLeafId()!;

    await t!.turn("second write", [
      calls("write", { path: path.join(storageDir, "b.txt"), content: "bbb" }),
      says("b done"),
    ]);
    const oldLeaf = sm.getLeafId()!;

    // Navigate back with summary — the summary's fromId preserves the old branch.
    sm.branchWithSummary(
      afterFirstWrite,
      "abandoned path",
      undefined,
      false,
      oldLeaf,
    );

    await t!.turn("new branch write", [
      calls("write", { path: path.join(storageDir, "c.txt"), content: "ccc" }),
      says("c done"),
    ]);

    // Compute state over the final branch — should include files from the
    // shared prefix (a.txt), the summarized abandoned branch (b.txt), and
    // the current branch (c.txt).
    const finalBranch = sm.getBranch();
    const state = computeSessionStorageState(finalBranch, storageDir, tmpDir, {
      sessionManager: sm,
      cwd: tmpDir,
    } as unknown as ExtensionContext);
    assert.equal(state.get(path.join(storageDir, "a.txt")), "aaa");
    assert.equal(state.get(path.join(storageDir, "b.txt")), "bbb");
    assert.equal(state.get(path.join(storageDir, "c.txt")), "ccc");
  });

  it("detects external modification and emits a session entry", async () => {
    const { storageDir } = await boot();

    // Use the real write tool (unmocked) so the file actually lands on disk
    // and the extension's internal-write tracking snapshots it.
    await t!.turn("write plan.md", [
      calls("write", {
        path: path.join(storageDir, "plan.md"),
        content: "v1",
      }),
      says("done"),
    ]);

    // External modification outside the tool pipeline
    await writeFile(path.join(storageDir, "plan.md"), "v2-external", "utf-8");

    // A no-op turn fires turn_end → detectExternalModifications
    await t!.turn("noop", [says("ok")]);

    const mods = externalMods(t!);
    assert.equal(mods.length, 1);
    assert.equal(mods[0].content, "v2-external");
  });

  it("does not emit for unchanged files", async () => {
    const { storageDir } = await boot();

    await t!.turn("write stable", [
      calls("write", {
        path: path.join(storageDir, "plan.md"),
        content: "stable",
      }),
      says("done"),
    ]);

    // Another turn with no external changes — detectExternalModifications
    // runs at turn_end and must not emit anything.
    await t!.turn("noop", [says("ok")]);

    assert.equal(externalMods(t!).length, 0);
  });

  it("detects external deletion", async () => {
    const { storageDir } = await boot();

    await t!.turn("write plan", [
      calls("write", {
        path: path.join(storageDir, "plan.md"),
        content: "will die",
      }),
      says("done"),
    ]);

    await rm(path.join(storageDir, "plan.md"));
    await t!.turn("noop", [says("ok")]);

    const mods = externalMods(t!);
    assert.equal(mods.length, 1);
    assert.equal(mods[0].content, null);
  });

  it("detects externally added file", async () => {
    const { storageDir } = await boot();

    await writeFile(path.join(storageDir, "surprise.txt"), "hello", "utf-8");
    await t!.turn("noop", [says("ok")]);

    const mods = externalMods(t!);
    assert.equal(mods.length, 1);
    assert.equal(mods[0].content, "hello");
  });

  it("compaction preserves session storage files", async () => {
    const { storageDir } = await boot();
    const sm = t!.sessionManager;

    await t!.turn("first plan", [
      calls("write", {
        path: path.join(storageDir, "plan.md"),
        content: "# Plan",
      }),
      says("done"),
    ]);
    const userEntryId = sm.getLeafId()!;

    await t!.turn("notes after", [
      calls("write", {
        path: path.join(storageDir, "notes.md"),
        content: "notes",
      }),
      says("done"),
    ]);

    sm.appendCompaction("summary of earlier work", userEntryId, 500);

    const state = computeSessionStorageState(
      sm.getBranch(),
      storageDir,
      tmpDir,
      { sessionManager: sm, cwd: tmpDir } as unknown as ExtensionContext,
    );
    assert.equal(state.get(path.join(storageDir, "plan.md")), "# Plan");
    assert.equal(state.get(path.join(storageDir, "notes.md")), "notes");
  });

  it("does not flag internal writes as external modifications", async () => {
    const { storageDir } = await boot();

    // First turn writes a file — extension's tool hooks should snapshot it
    // as an internal write (not external).
    await t!.turn("initial write", [
      calls("write", {
        path: path.join(storageDir, "file.txt"),
        content: "initial",
      }),
      says("done"),
    ]);

    // Second turn updates the same file through the tool pipeline again.
    // Between the tool's filesystem write and turn_end's detection, the
    // pendingInternalWrites set must bridge so detection stays silent.
    await t!.turn("internal update", [
      calls("write", {
        path: path.join(storageDir, "file.txt"),
        content: "internally updated",
      }),
      says("done"),
    ]);

    assert.equal(externalMods(t!).length, 0);
  });

  it("session_start sets an absolute PI_SESSION_STORAGE even when unset", async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "session-storage-test-"));
    delete process.env.PI_SESSION_STORAGE;

    t = await createTestSession({
      extensions: [EXTENSION_PATH],
      cwd: tmpDir,
      mockTools: MOCKS,
    });

    const dir = process.env.PI_SESSION_STORAGE ?? "";
    assert.ok(path.isAbsolute(dir), `Expected absolute path, got: ${dir}`);
    const sessionId = t.sessionManager.getSessionId();
    assert.ok(
      dir.includes(sessionId),
      `Expected dir to contain session ID ${sessionId}, got: ${dir}`,
    );
  });

  it("session_start overrides non-absolute PI_SESSION_STORAGE", async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "session-storage-test-"));
    const bogus = "32b2cb85-2992-439e-b342-e7a3ff89dbd1";
    process.env.PI_SESSION_STORAGE = bogus;

    t = await createTestSession({
      extensions: [EXTENSION_PATH],
      cwd: tmpDir,
      mockTools: MOCKS,
    });

    const dir = process.env.PI_SESSION_STORAGE!;
    assert.ok(path.isAbsolute(dir), `Expected absolute path, got: ${dir}`);
    assert.ok(
      !dir.endsWith(bogus),
      `Should not end with bare UUID, got: ${dir}`,
    );
    const sessionId = t.sessionManager.getSessionId();
    assert.ok(
      dir.includes(sessionId),
      `Expected dir to contain session ID ${sessionId}, got: ${dir}`,
    );
  });
});
