/**
 * Plan Workflow
 *
 * Provides the finish_plan tool, /plan, /finish-plan commands,
 * and the interactive review dialog flow.
 */

import type {
  ExtensionAPI,
  ExtensionUIContext,
  KeybindingsManager,
} from "@earendil-works/pi-coding-agent";
import { getMarkdownTheme, type Theme } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Text } from "@earendil-works/pi-tui";
import type { TUI } from "@earendil-works/pi-tui";
import { Type } from "@sinclair/typebox";
import { spawnSync } from "node:child_process";
import path from "node:path";
import type { AppState } from "../state.js";
import { planFinishedPrompt } from "../lib/prompts.js";

// ─── Helpers ───────────────────────────────────────────────────────────────────

export function getPlanFile(): string {
  return path.join(process.env.PI_SESSION_STORAGE!, "PLAN.md");
}

function extractPlanTitle(content: string): string | null {
  const firstLine = content.split("\n")[0].trim();
  if (firstLine.startsWith("#")) {
    let title = firstLine.replace(/^#+\s*/, "").trim();
    title = title.replace(/^Plan:\s*/i, "").trim();
    return title || null;
  }
  return null;
}

/**
 * Schedule the "approve and reset context" workflow: navigate to the first
 * branch entry with a literal plan-as-summary (no AI summarization pass), then
 * kick off implementation via planFinishedPrompt. Used both by the finish_plan
 * tool dialog (option 2) and by `/finish-plan with-reset` so the two paths
 * stay in lockstep.
 */
function scheduleApproveAndReset(
  state: AppState,
  pi: ExtensionAPI,
  planContents: string,
) {
  pi.runWhenIdle(async (cmdCtx) => {
    const branch = cmdCtx.sessionManager.getBranch();
    const firstEntry = branch[0];
    if (firstEntry) {
      state.plan.pendingTreeSummary = { summary: planContents };
      try {
        await cmdCtx.navigateTree(firstEntry.id, { summarize: true });
      } finally {
        delete state.plan.pendingTreeSummary;
      }
    }
    pi.sendUserMessage(planFinishedPrompt());
  });
}

// ─── Review Flow ───────────────────────────────────────────────────────────────

export async function runFinishPlanFlow(
  state: AppState,
  pi: ExtensionAPI,
  planFile: string,
  planContents: string,
  ctx: { ui: ExtensionUIContext; hasUI: boolean },
) {
  const showPlan = async () => {
    await ctx.ui.custom<void>(
      (
        tui: TUI,
        _theme: Theme,
        _kb: KeybindingsManager,
        done: (result: void) => void,
      ) => {
        tui.stop();
        process.stdout.write("\x1b[2J\x1b[H");

        const hasBat =
          spawnSync("which", ["bat"], { encoding: "utf8" }).status === 0;
        if (hasBat) {
          spawnSync(
            "bat",
            [
              "--paging=always",
              "--style=full",
              "--language=markdown",
              planFile,
            ],
            { stdio: "inherit" },
          );
        } else {
          spawnSync("less", [planFile], { stdio: "inherit" });
        }

        tui.start();
        tui.requestRender(true);
        done();
        return { render: () => [], invalidate: () => {} };
      },
    );
  };

  await showPlan();

  const choice = await ctx.ui.select("What would you like to do?", [
    "1. Begin implementing immediately",
    "2. Reset session context, then implement",
    "3. Continue planning",
  ]);

  if (!choice || choice.startsWith("3.")) {
    return;
  }

  if (choice.startsWith("1.")) {
    pi.sendUserMessage(planFinishedPrompt());
    return;
  }

  if (choice.startsWith("2.")) {
    scheduleApproveAndReset(state, pi, planContents);
  }
}

/** Auto-name session from plan file heading if not yet named */
export function autoNameSessionFromPlan(
  state: AppState,
  pi: ExtensionAPI,
  ctx: {
    sessionManager: {
      getSessionId(): string;
      getSessionName?(): string | undefined;
    };
  },
) {
  const planFile = getPlanFile();
  const tracked = state.sessionStorage.trackedFiles.get(planFile);

  const hasName =
    typeof ctx.sessionManager.getSessionName === "function"
      ? ctx.sessionManager.getSessionName()
      : pi.getSessionName();

  if (!hasName && tracked) {
    const title = extractPlanTitle(tracked.content);
    if (title) pi.setSessionName(title);
  }
}

// ─── Registration ──────────────────────────────────────────────────────────────

export function registerPlanningRenderers(pi: ExtensionAPI) {
  pi.registerMessageRenderer("plan-mode", (_message, _options, theme) => {
    return new Text(
      theme.fg("accent", `Plan mode active. Plan file: ${getPlanFile()}`),
      0,
      0,
    );
  });
}

export function registerPlanningTools(state: AppState, pi: ExtensionAPI) {
  pi.registerTool({
    name: "finish_plan",
    label: "Finish Plan",
    description:
      "Call this tool when the plan is complete and ready for the user to review. " +
      "It blocks until the user decides: implement now or continue planning.",
    promptSnippet: "Submit a finished plan to the user for review",
    promptGuidelines: [
      "Make all edits to the plan file and then call finish_plan once it's ready for review by the user.",
    ],
    parameters: Type.Object({}),

    renderCall(_args, theme, context) {
      const header =
        theme.fg("toolTitle", theme.bold("finish_plan")) +
        " " +
        theme.fg("accent", getPlanFile());
      const container = new Container();
      container.addChild(new Text(header, 0, 0));

      const tracked = state.sessionStorage.trackedFiles.get(getPlanFile());
      if (tracked) {
        if (context.isPartial || context.expanded) {
          container.addChild(new Markdown(tracked.content, 0, 0, getMarkdownTheme()));
        } else {
          container.addChild(new Text(theme.fg("dim", "(ctrl+o to show plan)"), 0, 0));
        }
      }

      return container;
    },

    renderResult(result, options, theme, context) {
      if (context.isError) {
        const content = result.content[0];
        const errorText = content?.type === "text" ? content.text : "Unknown error";
        return new Text(theme.fg("error", errorText), 0, 0);
      }

      const container = new Container();

      if (options.expanded) {
        container.addChild({
          render(width: number): string[] {
            return [theme.fg("borderMuted", "─".repeat(width))];
          },
          invalidate() {},
        });
      }

      const content = result.content[0];
      const statusText = content?.type === "text" ? content.text : "";
      container.addChild(new Text(theme.fg("dim", statusText), 0, 0));

      return container;
    },

    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const planFile = getPlanFile();
      const tracked = state.sessionStorage.trackedFiles.get(planFile);

      if (!tracked) {
        return {
          content: [
            {
              type: "text",
              text: `Error: No plan file found. Write your plan to ${planFile} before using this tool.`,
            },
          ],
          isError: true,
          details: {},
        };
      }

      const planContents = tracked.content;

      // If no UI, return immediately and tell user to use /finish-plan
      if (!ctx.hasUI) {
        return {
          content: [
            { type: "text", text: "Plan ready. Run /finish-plan to review." },
          ],
          details: { planContents },
        };
      }

      // Notify any listening extensions (e.g. tui) that we're about to block
      // on user input so they can arm a delayed notification for users who've
      // switched focus away from the terminal.
      const planTitle = extractPlanTitle(planContents) ?? "Untitled plan";
      pi.events.emit("tui:waiting-for-user", {
        title: `pi: ${pi.getSessionName() ?? path.basename(ctx.cwd)}`,
        message: `Plan ready for review: ${planTitle}`,
      });

      // Ask the user what to do
      const choice = await ctx.ui.select("What would you like to do?", [
        "1. Begin implementing immediately",
        "2. Approve and reset context",
        "3. Continue planning",
      ]);

      if (choice?.startsWith("2.")) {
        scheduleApproveAndReset(state, pi, planContents);
        return {
          content: [
            {
              type: "text",
              text: "This version of the plan was accepted and attempted in a separate session. The user has returned here, possibly to revise based on real-world experimentation.",
            },
          ],
          details: {},
          terminate: true,
        };
      }

      if (!choice || choice.startsWith("3.")) {
        // Hand control back to the user without aborting — terminate:true
        // stops the agent loop cleanly so no "Operation aborted" assistant
        // message ends up in history. The text is neutral about intent so a
        // subsequent /finish-plan now (no-wait-yes) doesn't contradict it.
        return {
          content: [
            {
              type: "text",
              text: "The user dismissed the review dialog. Wait for their next message before continuing.",
            },
          ],
          details: {},
          terminate: true,
        };
      }

      // Choice 1: Begin implementing
      return {
        content: [
          {
            type: "text",
            text: planFinishedPrompt(),
          },
        ],
        details: {},
      };
    },
  });
}

export function registerPlanningCommands(state: AppState, pi: ExtensionAPI) {
  // /finish-plan [now|with-reset]
  pi.registerCommand("finish-plan", {
    description:
      "Review the plan. 'now' skips the dialog and begins implementing immediately.",
    getArgumentCompletions: (prefix) => {
      const subcommands = ["now", "with-reset"];
      const filtered = subcommands.filter((s) => s.startsWith(prefix));
      return filtered.length > 0
        ? filtered.map((s) => ({ value: s, label: s }))
        : null;
    },
    handler: async (args, ctx) => {
      const planFile = getPlanFile();
      const tracked = state.sessionStorage.trackedFiles.get(planFile);

      if (!tracked) {
        ctx.ui.notify(
          "finish-plan: no plan file found for this session. Run /plan first.",
          "warning",
        );
        return;
      }

      const trimmedArgs = args.trim();

      if (trimmedArgs === "now") {
        pi.sendUserMessage(planFinishedPrompt());
        return;
      }

      if (trimmedArgs === "with-reset") {
        scheduleApproveAndReset(state, pi, tracked.content);
        return;
      }

      if (!ctx.hasUI) return;
      await runFinishPlanFlow(state, pi, planFile, tracked.content, ctx);
    },
  });

  // /plan command
  pi.registerCommand("plan", {
    description: "Start a plan-mode session",
    handler: async (args, _ctx) => {
      state.plan.pendingPlanModeMessage = true;

      if (args?.trim()) {
        pi.sendUserMessage(args.trim(), { deliverAs: "followUp" });
      }
    },
  });
}
