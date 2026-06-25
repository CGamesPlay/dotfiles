/**
 * Planning Flow — E2E Tests
 *
 * Covers the end-to-end planning scenarios:
 *   - Happy path — finish_plan dialog approved.
 *   - Revision path — dialog cancelled, agent calls finish_plan again.
 *   - Longer revision path — dialog cancelled, agent replies, user continues.
 *   - No-wait-yes — dialog cancelled, user runs /finish-plan now.
 *   - Finish in new session — dialog cancelled, user runs /finish-plan with-reset.
 *
 * Plus the original tool-registration / system-prompt / auto-naming coverage.
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { rm } from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  createTestSession,
  calls,
  says,
  type TestSession,
} from "../../../test-harness/index.js";

const EXTENSION = path.resolve(import.meta.dirname, "../index.ts");

const MOCK_TOOLS = { bash: "disabled" };

/** Read text content from a user message, joining all text parts. */
function userMessageText(msg: any): string {
  return msg.content
    .filter((c: any) => c.type === "text")
    .map((c: any) => c.text)
    .join("");
}

/** Concatenate all message content the LLM was given. */
function flattenContext(context: any): string {
  return (context?.messages ?? [])
    .map((m: any) => {
      if (typeof m.content === "string") return m.content;
      if (Array.isArray(m.content))
        return m.content.map((c: any) => c.text || "").join(" ");
      return "";
    })
    .join("\n");
}

describe("planning e2e", () => {
  let tmpDir: string;
  let storageDir: string;
  let t: TestSession | undefined;
  let selectQueue: Array<string | undefined>;

  afterEach(async () => {
    await t?.waitForIdle();
    t?.dispose();
    t = undefined;
    delete process.env.PI_SESSION_STORAGE;
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
      tmpDir = undefined as any;
    }
  });

  /**
   * Boot a session with a mocked select handler that pulls from `selectQueue`
   * in FIFO order. Push values onto `selectQueue` in each test before the
   * dialog runs. `undefined` simulates the user dismissing the dialog.
   */
  async function boot(opts: { onStreamFnCall?: (ctx: any) => void } = {}) {
    tmpDir = mkdtempSync(path.join(tmpdir(), "planning-e2e-"));
    storageDir = path.join(tmpDir, ".session-storage");
    process.env.PI_SESSION_STORAGE = storageDir;
    selectQueue = [];
    t = await createTestSession({
      extensions: [EXTENSION],
      cwd: tmpDir,
      mockTools: MOCK_TOOLS,
      mockUI: {
        select: () => {
          if (selectQueue.length === 0) {
            // Default: choose option 1 if a test forgot to enqueue.
            return "1. Begin implementing immediately";
          }
          return selectQueue.shift();
        },
      },
      onStreamFnCall: opts.onStreamFnCall,
    });
  }

  function planPath(): string {
    return path.join(storageDir, "PLAN.md");
  }

  // ─── Tool Registration ────────────────────────────────────────────────────

  describe("tool registration", () => {
    it("extension registers finish_plan tool", async () => {
      await boot();
      const toolNames = t!.session.getAllTools().map((t: any) => t.name);
      assert.ok(
        toolNames.includes("finish_plan"),
        `finish_plan not in: ${toolNames.join(", ")}`,
      );
    });
  });

  // ─── /plan Command ────────────────────────────────────────────────────────

  describe("/plan command", () => {
    it("activates plan mode; next prompt gets plan-mode injection mentioning PLAN.md", async () => {
      let capturedContext: any = null;
      await boot({ onStreamFnCall: (c) => (capturedContext = c) });

      await t!.turn("/plan Design the auth system", [
        says("I'll start planning."),
      ]);

      const allContent = flattenContext(capturedContext);
      assert.ok(
        allContent.includes("Plan mode is active"),
        "LLM context should include plan-mode instructions",
      );
      assert.ok(
        allContent.includes("PLAN.md"),
        "LLM context should reference the plan file location",
      );
    });

    it("plan-mode message is not injected when plan mode is inactive", async () => {
      let capturedContext: any = null;
      await boot({ onStreamFnCall: (c) => (capturedContext = c) });

      await t!.turn("Just say hello", [says("Hello!")]);

      assert.ok(
        !flattenContext(capturedContext).includes("Plan mode is active"),
        "plan-mode should NOT be injected for normal prompts",
      );
    });
  });

  // ─── /finish-plan command — no plan file ──────────────────────────────────

  describe("/finish-plan command", () => {
    it("warns when no plan file exists", async () => {
      await boot();
      await t!.turn("/finish-plan now", []);

      const warning = t!.events
        .uiCallsFor("notify")
        .find((c: any) => c.args[1] === "warning");
      assert.ok(warning, "should have warning notification");
      assert.ok(
        (warning.args[0] as string).includes("no plan file"),
        `expected 'no plan file' in: ${warning.args[0]}`,
      );
    });
  });

  // ─── Happy path ───────────────────────────────────────────────────────────
  //
  // /plan → agent writes PLAN.md, calls finish_plan → user picks option 1
  // (implement) → tool returns planFinishedPrompt, agent continues turn and
  // implements. Next user message goes through normally.

  describe("happy path", () => {
    it("approves via dialog and continues to implementation", async () => {
      await boot();
      selectQueue.push("1. Begin implementing immediately");

      await t!.turn("/plan Design the auth system", [
        calls("write", {
          path: planPath(),
          content: "# Auth\n\n1. Login\n2. Sessions",
        }),
        calls("finish_plan", {}),
        says("Implementing now."),
      ]);

      const finishResults = t!.events.toolResultsFor("finish_plan");
      assert.equal(finishResults.length, 1);
      assert.ok(
        finishResults[0].text.includes("plan has been approved"),
        `Expected approval text in tool result, got: ${finishResults[0].text}`,
      );

      // Next user message: agent gets a normal turn.
      await t!.turn("now do step 3", [says("Working on it.")]);

      const lastAssistant = t!.events.messages
        .filter((m: any) => m.role === "assistant")
        .at(-1) as any;
      assert.equal(
        lastAssistant.content
          .filter((c: any) => c.type === "text")
          .map((c: any) => c.text)
          .join(""),
        "Working on it.",
      );
    });
  });

  // ─── Revision path ────────────────────────────────────────────────────────
  //
  // /plan → agent writes plan, calls finish_plan → user cancels dialog →
  // tool result reports a neutral dismissal + terminate:true ends the turn →
  // user sends a follow-up message → agent revises plan, calls finish_plan
  // again → user picks option 1 → agent implements.

  describe("revision path", () => {
    it("cancel then approve on second finish_plan call", async () => {
      await boot();
      // First dialog: cancel. Second dialog: approve.
      selectQueue.push(undefined, "1. Begin implementing immediately");

      // Turn 1: write plan, call finish_plan → user cancels → tool returns
      // terminate:true and the agent loop stops cleanly.
      await t!.turn("/plan Design auth", [
        calls("write", {
          path: planPath(),
          content: "# Auth v1\n\nFirst draft.",
        }),
        calls("finish_plan", {}),
      ]);

      let finishResults = t!.events.toolResultsFor("finish_plan");
      assert.equal(finishResults.length, 1);
      assert.ok(
        finishResults[0].text.includes("dismissed the review dialog"),
        `Expected dismissal text after cancel, got: ${finishResults[0].text}`,
      );

      // Turn 2: user feedback → agent revises and calls finish_plan again →
      // approves this time → implements.
      await t!.turn("Add error handling to the plan", [
        calls("write", {
          path: planPath(),
          content: "# Auth v2\n\nDraft + error handling.",
        }),
        calls("finish_plan", {}),
        says("Implementing now."),
      ]);

      finishResults = t!.events.toolResultsFor("finish_plan");
      assert.equal(finishResults.length, 2);
      assert.ok(
        finishResults[1].text.includes("plan has been approved"),
        `Expected approval on second finish_plan, got: ${finishResults[1].text}`,
      );

      // Turn 3: normal follow-up.
      await t!.turn("now ship it", [says("Shipping.")]);
    });
  });

  // ─── Longer revision path ─────────────────────────────────────────────────
  //
  // /plan → agent writes plan, calls finish_plan → user cancels → user sends
  // a message → agent replies *without* calling finish_plan again → user
  // sends another normal message → normal turn.

  describe("longer revision path", () => {
    it("agent can reply normally after cancellation, then accept further input", async () => {
      await boot();
      selectQueue.push(undefined);

      await t!.turn("/plan Design auth", [
        calls("write", {
          path: planPath(),
          content: "# Auth\n\nDraft.",
        }),
        calls("finish_plan", {}),
      ]);

      const finishResults = t!.events.toolResultsFor("finish_plan");
      assert.equal(finishResults.length, 1);
      assert.ok(finishResults[0].text.includes("dismissed the review dialog"));

      // Agent replies without re-invoking finish_plan.
      await t!.turn("What if we used JWT?", [
        says("JWT would simplify session storage."),
      ]);

      // A further normal user turn still works.
      await t!.turn("OK make that change", [says("Updated.")]);

      // Sanity: only one finish_plan call across the whole flow.
      assert.equal(t!.events.toolResultsFor("finish_plan").length, 1);
    });
  });

  // ─── No-wait-yes ──────────────────────────────────────────────────────────
  //
  // /plan → agent writes plan, calls finish_plan → user cancels → user runs
  // /finish-plan now → planFinishedPrompt sent as followUp → agent implements.

  describe("no-wait-yes", () => {
    it("/finish-plan now after cancellation triggers implementation", async () => {
      await boot();
      selectQueue.push(undefined);

      await t!.turn("/plan Design auth", [
        calls("write", {
          path: planPath(),
          content: "# Auth\n\nDraft.",
        }),
        calls("finish_plan", {}),
      ]);

      // /finish-plan now sends planFinishedPrompt as a followUp, which
      // triggers a fresh agent turn.
      await t!.turn("/finish-plan now", [says("Implementing now.")]);

      const userMsgs = t!.events.messages.filter((m: any) => m.role === "user");
      const lastUserText = userMessageText(userMsgs.at(-1));
      assert.ok(
        lastUserText.includes("plan has been approved"),
        `Expected planFinishedPrompt as last user message, got: ${lastUserText.slice(0, 120)}`,
      );

      // Snapshot the cancel-branch tool result text. Locks in neutral
      // wording so a future change that re-introduces "continue refining"
      // (or any contradictory intent claim) breaks this test loudly.
      const finishToolResult = t!.events.toolResultsFor("finish_plan")[0];
      assert.ok(
        finishToolResult.text.includes("dismissed the review dialog"),
        `unexpected cancel text: ${finishToolResult.text}`,
      );

      // No assistant turn should be marked as aborted — finish_plan should
      // terminate the turn cleanly via terminate:true on its result, not via
      // ctx.abort() which leaves an "Operation aborted" assistant message in
      // history that the agent sees on the next turn.
      const abortedAssistant = t!.events.messages.find(
        (m: any) =>
          m.role === "assistant" && (m as any).stopReason === "aborted",
      );
      assert.equal(
        abortedAssistant,
        undefined,
        'No assistant message should have stopReason "aborted"',
      );

      // Next normal message goes through.
      await t!.turn("status?", [says("On step 1.")]);
    });
  });

  // ─── Finish in new session ────────────────────────────────────────────────
  //
  // /plan → agent writes plan, calls finish_plan → user cancels → user runs
  // /finish-plan with-reset → session navigates to start with a literal plan
  // branch summary, then sends planFinishedPrompt() — same shape as the
  // dialog "Approve and reset context" path.

  describe("finish in new session", () => {
    it("/finish-plan with-reset navigates with a plan branch summary and starts the implement turn", async () => {
      await boot();
      selectQueue.push(undefined);

      const planContent = "# Auth Plan\n\n1. Do X\n2. Do Y";

      await t!.turn("/plan Design auth", [
        calls("write", {
          path: planPath(),
          content: planContent,
        }),
        calls("finish_plan", {}),
      ]);

      // After /finish-plan with-reset, the runWhenIdle callback navigates
      // (inserting a branch_summary) and sends planFinishedPrompt(), which
      // spawns the implementation turn satisfied by the trailing says().
      await t!.turn("/finish-plan with-reset", [says("Implementing now.")]);

      // Walk current branch leaf → root and find the trailing chain
      //   ... → branch_summary → user(planFinishedPrompt) → assistant(Implementing now.)
      const branch = t!.sessionManager.getBranch();
      const lastAssistantIdx = branch.findIndex(
        (e: any, i: number) =>
          e.type === "message" &&
          e.message.role === "assistant" &&
          !branch
            .slice(i + 1)
            .some(
              (later: any) =>
                later.type === "message" && later.message.role === "assistant",
            ),
      );
      assert.ok(
        lastAssistantIdx >= 2,
        `expected assistant entry preceded by user + branch_summary, branch=${branch
          .map((e: any) => e.type)
          .join(",")}`,
      );
      const userEntry = branch[lastAssistantIdx - 1] as any;
      const summaryEntry = branch[lastAssistantIdx - 2] as any;

      assert.equal(summaryEntry.type, "branch_summary");
      assert.equal(summaryEntry.summary, planContent);
      assert.equal(summaryEntry.fromHook, true);

      assert.equal(userEntry.type, "message");
      assert.equal(userEntry.message.role, "user");
      const userText = userMessageText(userEntry.message);
      assert.ok(
        userText.includes("The plan has been approved"),
        `expected planFinishedPrompt() as user message, got: ${userText.slice(0, 120)}`,
      );

      await t!.turn("status?", [says("On step 1.")]);
    });
  });

  // ─── Approve-with-reset path ──────────────────────────────────────────────
  //
  // /plan → agent writes plan, calls finish_plan → user picks option 2
  // (approve and reset context) → tool navigates to start with a literal
  // branch summary (plan contents, no AI summarizer call) → user message
  // planFinishedPrompt() kicks off the implementation turn.

  describe("approve-with-reset path", () => {
    it("dialog option 2 navigates with a plan branch summary and starts the implement turn", async () => {
      await boot();
      selectQueue.push("2. Approve and reset context");

      const planContent = "# Auth Plan\n\n1. Do X\n2. Do Y";

      // After finish_plan terminates, the runWhenIdle callback navigates
      // (inserting a branch_summary) and sends planFinishedPrompt(), which
      // spawns the next agent turn satisfied by the trailing says().
      await t!.turn("/plan Design auth", [
        calls("write", {
          path: planPath(),
          content: planContent,
        }),
        calls("finish_plan", {}),
        says("Implementing now."),
      ]);

      // 1. finish_plan tool result — this entry sits on the abandoned
      //    branch. Walk all entries (not just the current branch) so we
      //    can find it even after navigation.
      const allEntries = t!.sessionManager.getEntries();
      const finishToolResults = allEntries.filter(
        (e: any) =>
          e.type === "message" &&
          e.message.role === "toolResult" &&
          e.message.toolName === "finish_plan",
      );
      assert.equal(
        finishToolResults.length,
        1,
        "expected exactly one finish_plan tool result entry",
      );
      const finishResultText = (finishToolResults[0] as any).message.content
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text)
        .join("");
      assert.equal(
        finishResultText,
        "This version of the plan was accepted and attempted in a separate session. The user has returned here, possibly to revise based on real-world experimentation.",
      );

      // 2. New branch threading: walk the current branch leaf → root and
      //    find the trailing chain
      //      ... → branch_summary → user(planFinishedPrompt) → assistant(Implementing now.)
      const branch = t!.sessionManager.getBranch();

      // Last assistant message in the branch.
      const lastAssistantIdx = branch.findIndex(
        (e: any, i: number) =>
          e.type === "message" &&
          e.message.role === "assistant" &&
          // Last assistant means: no later assistant in branch.
          !branch
            .slice(i + 1)
            .some(
              (later: any) =>
                later.type === "message" && later.message.role === "assistant",
            ),
      );
      assert.ok(
        lastAssistantIdx >= 2,
        `expected assistant entry preceded by user + branch_summary, branch=${branch
          .map((e: any) => e.type)
          .join(",")}`,
      );
      const assistantEntry = branch[lastAssistantIdx] as any;
      const userEntry = branch[lastAssistantIdx - 1] as any;
      const summaryEntry = branch[lastAssistantIdx - 2] as any;

      // 3. Branch summary entry: parented under the navigation target,
      //    fromId pointing at the abandoned leaf.
      assert.equal(summaryEntry.type, "branch_summary");
      assert.equal(summaryEntry.summary, planContent);
      assert.equal(summaryEntry.fromHook, true);
      assert.equal(
        summaryEntry.parentId,
        branch[0].id,
        "branch_summary should be parented under the navigation target (root entry)",
      );
      assert.ok(
        typeof summaryEntry.fromId === "string" &&
          summaryEntry.fromId.length > 0,
        "branch_summary entry should reference the abandoned leaf via fromId",
      );
      // fromId points into the abandoned branch — it must exist in
      // getEntries() but not in the current branch.
      assert.ok(
        allEntries.some((e: any) => e.id === summaryEntry.fromId),
        "branch_summary.fromId must reference an existing entry",
      );
      assert.ok(
        !branch.some((e: any) => e.id === summaryEntry.fromId),
        "branch_summary.fromId must point at the abandoned branch, not the current one",
      );

      // 4. User message immediately follows the summary, parented to it.
      assert.equal(userEntry.type, "message");
      assert.equal(userEntry.message.role, "user");
      assert.equal(
        userEntry.parentId,
        summaryEntry.id,
        "user message should be parented to the branch_summary",
      );
      const userText = userMessageText(userEntry.message);
      assert.ok(
        userText.includes("The plan has been approved"),
        `expected planFinishedPrompt() as user message, got: ${userText.slice(0, 120)}`,
      );

      // 5. Assistant message follows the user message, parented to it.
      assert.equal(assistantEntry.type, "message");
      assert.equal(assistantEntry.message.role, "assistant");
      assert.equal(
        assistantEntry.parentId,
        userEntry.id,
        "assistant message should be parented to the user message",
      );
      const assistantText = assistantEntry.message.content
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text)
        .join("");
      assert.equal(assistantText, "Implementing now.");

      await t!.turn("status?", [says("On step 1.")]);
    });
  });

  // ─── System Prompt ────────────────────────────────────────────────────────

  describe("system prompt", () => {
    it("is modified by extension (includes session storage path)", async () => {
      let capturedSystemPrompt = "";
      await boot({
        onStreamFnCall: (ctx) => {
          capturedSystemPrompt = ctx.systemPrompt || "";
        },
      });

      await t!.turn("test", [says("ok")]);

      assert.ok(
        capturedSystemPrompt.includes("PI_SESSION_STORAGE"),
        "system prompt should include PI_SESSION_STORAGE after before_agent_start",
      );
    });
  });

  // ─── Auto-Name from Plan ──────────────────────────────────────────────────

  describe("auto-name from plan", () => {
    it("names session from plan title when unnamed", async () => {
      await boot();
      await t!.turn("/plan Add dark mode", [
        calls("write", {
          path: planPath(),
          content: "# Plan: Dark Mode Support\n\nStuff.",
        }),
        says("Plan created"),
      ]);

      assert.equal(t!.sessionManager.getSessionName(), "Dark Mode Support");
    });

    it("does not overwrite existing session name", async () => {
      await boot();
      t!.sessionManager.appendSessionInfo("Existing Name");

      await t!.turn("Write the plan", [
        calls("write", {
          path: planPath(),
          content: "# New Name\n\nStuff.",
        }),
        says("Plan created"),
      ]);

      assert.equal(t!.sessionManager.getSessionName(), "Existing Name");
    });

    it("does nothing when no plan file exists", async () => {
      await boot();
      await t!.turn("nop", [says("ok")]);
      assert.equal(t!.sessionManager.getSessionName(), undefined);
    });
  });
});
