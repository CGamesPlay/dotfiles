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
import {
  mkdtemp,
  readFile,
  writeFile,
  rm,
  readdir,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  computeSessionStorageState,
  resyncSessionStorage,
  detectExternalModifications,
} from "../lib/session-storage.js";
import { createAppState } from "../state.js";
import {
  SessionManager,
  type ExtensionAPI,
} from "@mariozechner/pi-coding-agent";
import type { AssistantMessage, ToolResultMessage } from "@mariozechner/pi-ai";
import type {
  SessionEntry,
  SessionMessageEntry,
  CustomEntry,
  CompactionEntry,
  BranchSummaryEntry,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";

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

// ─── Integration Tests (real filesystem + real SessionManager) ─────────────────

describe("session-storage integration", () => {
  let tmpDir: string;

  afterEach(async () => {
    delete process.env.PI_SESSION_STORAGE;
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  async function setup() {
    tmpDir = await mkdtemp(path.join(tmpdir(), "session-storage-test-"));
    // Point session storage into the temp dir so resolveSessionStorageDir uses it
    const storageDir = path.join(tmpDir, ".session-storage");
    process.env.PI_SESSION_STORAGE = storageDir;
  }

  function getStorageDir(): string {
    return process.env.PI_SESSION_STORAGE!;
  }

  /** Minimal assistant message with a single tool call */
  function assistantMsg(
    toolCallId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): AssistantMessage {
    return {
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: toolCallId,
          name: toolName,
          arguments: args,
        },
      ],
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
      stopReason: "toolUse",
      timestamp: Date.now(),
    };
  }

  /** Minimal tool result message */
  function toolResultMsg(
    toolCallId: string,
    toolName: string,
    isError = false,
  ): ToolResultMessage {
    return {
      role: "toolResult",
      toolCallId,
      toolName,
      content: [{ type: "text", text: isError ? "Error" : "OK" }],
      isError,
      timestamp: Date.now(),
    };
  }

  /** Minimal user message */
  function userMsg(text: string) {
    return { role: "user" as const, content: text, timestamp: Date.now() };
  }

  /** Build a ctx from a real SessionManager */
  function ctxFrom(sm: SessionManager): ExtensionContext {
    return {
      cwd: sm.getCwd(),
      hasUI: false,
      ui: { notify: () => {} },
      sessionManager: sm,
    } as unknown as ExtensionContext;
  }

  /** Build a mock pi that records appendEntry calls and also writes to the session manager */
  function piFrom(sm: SessionManager) {
    const entries: Array<{ type: string; data: unknown }> = [];
    return {
      entries,
      appendEntry(customType: string, data?: unknown) {
        entries.push({ type: customType, data });
        sm.appendCustomEntry(customType, data);
      },
    } as unknown as ExtensionAPI & {
      entries: Array<{ type: string; data: unknown }>;
    };
  }

  it("resync materializes files and tracks state", async () => {
    await setup();
    const sm = SessionManager.inMemory(tmpDir);
    const state = createAppState();

    sm.appendMessage(
      assistantMsg("tc1", "write", {
        path: path.join(getStorageDir(), "plan.md"),
        content: "# My Plan",
      }),
    );
    sm.appendMessage(toolResultMsg("tc1", "write"));

    await resyncSessionStorage(state, ctxFrom(sm));

    const sessionDir = getStorageDir();
    const content = await readFile(path.join(sessionDir, "plan.md"), "utf-8");
    assert.equal(content, "# My Plan");

    assert.equal(state.sessionStorage.trackedFiles.size, 1);
    const tracked = state.sessionStorage.trackedFiles.get(
      path.join(sessionDir, "plan.md"),
    );
    assert.ok(tracked);
    assert.equal(tracked.content, "# My Plan");
  });

  it("resync replays writes and edits in order", async () => {
    await setup();
    const sm = SessionManager.inMemory(tmpDir);
    const state = createAppState();

    sm.appendMessage(
      assistantMsg("tc1", "write", {
        path: path.join(getStorageDir(), "f.txt"),
        content: "hello world",
      }),
    );
    sm.appendMessage(toolResultMsg("tc1", "write"));
    sm.appendMessage(
      assistantMsg("tc2", "edit", {
        path: path.join(getStorageDir(), "f.txt"),
        oldText: "world",
        newText: "universe",
      }),
    );
    sm.appendMessage(toolResultMsg("tc2", "edit"));

    await resyncSessionStorage(state, ctxFrom(sm));

    const content = await readFile(
      path.join(getStorageDir(), "f.txt"),
      "utf-8",
    );
    assert.equal(content, "hello universe");
  });

  it("branch summary preserves files from abandoned branch", async () => {
    await setup();
    const sm = SessionManager.inMemory(tmpDir);
    const state = createAppState();
    const sessionDir = getStorageDir();

    // Write two files on the original branch
    sm.appendMessage(
      assistantMsg("tc1", "write", {
        path: path.join(getStorageDir(), "a.txt"),
        content: "aaa",
      }),
    );
    sm.appendMessage(toolResultMsg("tc1", "write"));
    const afterFirstWrite = sm.getLeafId()!;
    sm.appendMessage(
      assistantMsg("tc2", "write", {
        path: path.join(getStorageDir(), "b.txt"),
        content: "bbb",
      }),
    );
    sm.appendMessage(toolResultMsg("tc2", "write"));
    const oldLeaf = sm.getLeafId()!;

    await resyncSessionStorage(state, ctxFrom(sm));
    assert.equal((await readdir(sessionDir)).length, 2);

    // Navigate back with summary — the summary's fromId preserves the old branch
    sm.branchWithSummary(
      afterFirstWrite,
      "abandoned path",
      undefined,
      false,
      oldLeaf,
    );

    // Write a new file on the new branch
    sm.appendMessage(
      assistantMsg("tc3", "write", {
        path: path.join(getStorageDir(), "c.txt"),
        content: "ccc",
      }),
    );
    sm.appendMessage(toolResultMsg("tc3", "write"));

    await resyncSessionStorage(state, ctxFrom(sm));

    // All three files present: a.txt from shared prefix, b.txt from summarized branch, c.txt from new branch
    const files = (await readdir(sessionDir)).sort();
    assert.deepEqual(files, ["a.txt", "b.txt", "c.txt"]);
  });

  it("detects external modification and preserves it through resync", async () => {
    await setup();
    const sm = SessionManager.inMemory(tmpDir);
    const state = createAppState();
    const sessionDir = getStorageDir();
    const pi = piFrom(sm);

    // Initial resync
    sm.appendMessage(
      assistantMsg("tc1", "write", {
        path: path.join(getStorageDir(), "plan.md"),
        content: "v1",
      }),
    );
    sm.appendMessage(toolResultMsg("tc1", "write"));
    await resyncSessionStorage(state, ctxFrom(sm));

    // External modification
    await writeFile(path.join(sessionDir, "plan.md"), "v2-external", "utf-8");

    // Detect — pi.appendEntry writes to the real SessionManager
    await detectExternalModifications(state, pi, ctxFrom(sm));
    assert.equal(pi.entries.length, 1);
    assert.equal((pi.entries[0].data as any).content, "v2-external");

    // Resync — the external-mod entry is now in the session, should survive
    await resyncSessionStorage(state, ctxFrom(sm));
    const content = await readFile(path.join(sessionDir, "plan.md"), "utf-8");
    assert.equal(content, "v2-external");
  });

  it("does not emit for unchanged files", async () => {
    await setup();
    const sm = SessionManager.inMemory(tmpDir);
    const state = createAppState();
    const pi = piFrom(sm);

    sm.appendMessage(
      assistantMsg("tc1", "write", {
        path: path.join(getStorageDir(), "plan.md"),
        content: "stable",
      }),
    );
    sm.appendMessage(toolResultMsg("tc1", "write"));
    await resyncSessionStorage(state, ctxFrom(sm));

    await detectExternalModifications(state, pi, ctxFrom(sm));
    assert.equal(pi.entries.length, 0);
  });

  it("detects external deletion", async () => {
    await setup();
    const sm = SessionManager.inMemory(tmpDir);
    const state = createAppState();
    const sessionDir = getStorageDir();
    const pi = piFrom(sm);

    sm.appendMessage(
      assistantMsg("tc1", "write", {
        path: path.join(getStorageDir(), "plan.md"),
        content: "will die",
      }),
    );
    sm.appendMessage(toolResultMsg("tc1", "write"));
    await resyncSessionStorage(state, ctxFrom(sm));

    await rm(path.join(sessionDir, "plan.md"));
    await detectExternalModifications(state, pi, ctxFrom(sm));

    assert.equal(pi.entries.length, 1);
    assert.equal((pi.entries[0].data as any).content, null);

    // Resync — file should be gone
    await resyncSessionStorage(state, ctxFrom(sm));
    const files = await readdir(sessionDir);
    assert.deepEqual(files, []);
  });

  it("detects externally added file", async () => {
    await setup();
    const sm = SessionManager.inMemory(tmpDir);
    const state = createAppState();
    const sessionDir = getStorageDir();
    const pi = piFrom(sm);

    await resyncSessionStorage(state, ctxFrom(sm));
    await writeFile(path.join(sessionDir, "surprise.txt"), "hello", "utf-8");

    await detectExternalModifications(state, pi, ctxFrom(sm));
    assert.equal(pi.entries.length, 1);
    assert.equal((pi.entries[0].data as any).content, "hello");

    // Resync — file should persist
    await resyncSessionStorage(state, ctxFrom(sm));
    const content = await readFile(
      path.join(sessionDir, "surprise.txt"),
      "utf-8",
    );
    assert.equal(content, "hello");
  });

  it("compaction preserves session storage files", async () => {
    await setup();
    const sm = SessionManager.inMemory(tmpDir);
    const state = createAppState();

    sm.appendMessage(
      assistantMsg("tc1", "write", {
        path: path.join(getStorageDir(), "plan.md"),
        content: "# Plan",
      }),
    );
    sm.appendMessage(toolResultMsg("tc1", "write"));
    sm.appendMessage(userMsg("continue"));
    const userEntryId = sm.getLeafId()!;
    sm.appendMessage(
      assistantMsg("tc2", "write", {
        path: path.join(getStorageDir(), "notes.md"),
        content: "notes",
      }),
    );
    sm.appendMessage(toolResultMsg("tc2", "write"));

    // Compact to the user message
    sm.appendCompaction("summary of earlier work", userEntryId, 500);

    await resyncSessionStorage(state, ctxFrom(sm));

    const sessionDir = getStorageDir();
    assert.equal(
      await readFile(path.join(sessionDir, "plan.md"), "utf-8"),
      "# Plan",
    );
    assert.equal(
      await readFile(path.join(sessionDir, "notes.md"), "utf-8"),
      "notes",
    );
  });

  it("does not flag internal writes as external modifications", async () => {
    await setup();
    const sm = SessionManager.inMemory(tmpDir);
    const state = createAppState();
    const sessionDir = getStorageDir();
    const pi = piFrom(sm);

    sm.appendMessage(
      assistantMsg("tc1", "write", {
        path: path.join(getStorageDir(), "file.txt"),
        content: "initial",
      }),
    );
    sm.appendMessage(toolResultMsg("tc1", "write"));
    await resyncSessionStorage(state, ctxFrom(sm));

    // Simulate internal write lifecycle (what tool_call/tool_result hooks do)
    const filePath = path.join(sessionDir, "file.txt");
    state.sessionStorage.pendingInternalWrites.add(filePath);
    await writeFile(filePath, "internally updated", "utf-8");
    const s = await stat(filePath);
    state.sessionStorage.trackedFiles.set(filePath, {
      content: "internally updated",
      ino: s.ino,
      mtimeMs: s.mtimeMs,
    });
    state.sessionStorage.pendingInternalWrites.delete(filePath);

    await detectExternalModifications(state, pi, ctxFrom(sm));
    assert.equal(pi.entries.length, 0);
  });

  it("resolveSessionStorageDir derives absolute path when env var is not set", async () => {
    // Don't call setup() — we want PI_SESSION_STORAGE unset
    delete process.env.PI_SESSION_STORAGE;
    tmpDir = await mkdtemp(path.join(tmpdir(), "session-storage-test-"));

    const sm = SessionManager.inMemory(tmpDir);
    const state = createAppState();
    const ctx = ctxFrom(sm);

    await resyncSessionStorage(state, ctx);

    // state.sessionStorage.dir must be an absolute path, not a bare UUID
    assert.ok(
      path.isAbsolute(state.sessionStorage.dir),
      `Expected absolute path, got: ${state.sessionStorage.dir}`,
    );
    // It must contain the session ID as a component
    const sessionId = sm.getSessionId();
    assert.ok(
      state.sessionStorage.dir.includes(sessionId),
      `Expected dir to contain session ID ${sessionId}, got: ${state.sessionStorage.dir}`,
    );
    // PI_SESSION_STORAGE env var must also be set to the same absolute path
    assert.equal(process.env.PI_SESSION_STORAGE, state.sessionStorage.dir);
  });

  it("resolveSessionStorageDir ignores non-absolute PI_SESSION_STORAGE", async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "session-storage-test-"));

    // Simulate the bug: env var set to a bare UUID
    process.env.PI_SESSION_STORAGE = "32b2cb85-2992-439e-b342-e7a3ff89dbd1";

    const sm = SessionManager.inMemory(tmpDir);
    const state = createAppState();
    const ctx = ctxFrom(sm);

    await resyncSessionStorage(state, ctx);

    // Must derive the proper absolute path, not use the bare UUID
    assert.ok(
      path.isAbsolute(state.sessionStorage.dir),
      `Expected absolute path, got: ${state.sessionStorage.dir}`,
    );
    assert.ok(
      !state.sessionStorage.dir.endsWith(
        "32b2cb85-2992-439e-b342-e7a3ff89dbd1",
      ),
      `Should not end with bare UUID, got: ${state.sessionStorage.dir}`,
    );
    const sessionId = sm.getSessionId();
    assert.ok(
      state.sessionStorage.dir.includes(sessionId),
      `Expected dir to contain session ID ${sessionId}, got: ${state.sessionStorage.dir}`,
    );
  });
});
