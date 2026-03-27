/**
 * plan-files extension
 *
 * Registers a `/plan` command that:
 *   1. Derives a session-scoped plan file path: ~/.pi/agent/plans/<session_id>.md
 *   2. Reads the plan.md prompt template and substitutes $PLAN_FILE with that path
 *   3. Sends the resolved prompt as a user message to start the planning workflow
 *
 * The extension command shadows the /plan prompt template so that $PLAN_FILE
 * is always resolved before the agent sees the prompt.
 *
 * Also registers:
 *   - `/plans`        — list existing plan files
 *   - `/finish-plan`       — show full review dialog (open plan in bat/less,
 *                           then select action).
 *   - `/finish-plan now`  — skip dialog, begin implementing immediately.
 *   - `/finish-plan with-reset` — internal: skip dialog, reset context +
 *                           implement; queued from agent_end (no navigateTree).
 *   - `finish_plan`   — tool the model calls when the plan is ready for review;
 *                       triggers the same flow via agent_end.
 */

import type { ExtensionAPI, ExtensionUIContext, KeybindingsManager } from "@mariozechner/pi-coding-agent";
import type { Theme } from "@mariozechner/pi-coding-agent";
import type { TUI } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";

// Directory of the package's bundled prompts (share/pi/prompts/)
const PACKAGE_PROMPTS_DIR = path.resolve(
  fileURLToPath(import.meta.url),
  "..",
  "..",
  "..",
  "prompts",
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAgentDir(): string {
  const envKeys = ["PI_CODING_AGENT_DIR", "TAU_CODING_AGENT_DIR"];
  for (const k of envKeys) {
    const v = process.env[k];
    if (v) {
      if (v === "~") return os.homedir();
      if (v.startsWith("~/")) return path.join(os.homedir(), v.slice(2));
      return v;
    }
  }
  for (const [k, v] of Object.entries(process.env)) {
    if (k.endsWith("_CODING_AGENT_DIR") && v) return v;
  }
  return path.join(os.homedir(), ".pi", "agent");
}

function stripFrontmatter(content: string): string {
  return content.replace(/^---[\s\S]*?---\n?/, "");
}

async function readPlanTitle(filePath: string): Promise<string | null> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const firstLine = content.split("\n")[0].trim();
    if (firstLine.startsWith("#")) {
      let title = firstLine.replace(/^#+\s*/, "").trim();
      title = title.replace(/^Plan:\s*/i, "").trim();
      return title || null;
    }
  } catch {
    // File unreadable — skip title
  }
  return null;
}

async function readTemplate(
  agentDir: string,
  name: string,
): Promise<string | null> {
  // Try the package's own prompts directory first, then fall back to agentDir.
  const candidates = [
    path.join(PACKAGE_PROMPTS_DIR, `${name}.md`),
    path.join(agentDir, "prompts", `${name}.md`),
  ];
  for (const filePath of candidates) {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      return stripFrontmatter(raw);
    } catch {
      // try next candidate
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function planFilesExtension(pi: ExtensionAPI) {
  // Set when finish_plan tool fires; agent_end reads and clears it.
  let pendingFinishPlan = false;

  // ---------------------------------------------------------------------------
  // Shared: show select dialog + act on choice.
  // navigateToStart is passed in as a callback because navigateTree is only
  // available on ExtensionCommandContext. When called from agent_end (which
  // has plain ExtensionContext), it's omitted and we fall back to queuing
  // /finish-plan with-reset as a follow-up command instead.
  // ---------------------------------------------------------------------------

  async function runFinishPlanFlow(
    agentDir: string,
    planFile: string,
    ctx: { ui: ExtensionUIContext; hasUI: boolean },
    navigateToStart?: () => Promise<void>,
  ) {
    // Read the plan file
    let planContents: string;
    try {
      planContents = await fs.readFile(planFile, "utf8");
    } catch {
      ctx.ui.notify("finish_plan: could not read plan file.", "error");
      return;
    }

    // Open the plan in bat (fallback: less) with full terminal access.
    // tui.stop() releases the terminal to the subprocess; tui.start() reclaims it.
    const showPlan = async () => {
      await ctx.ui.custom<void>((tui: TUI, _theme: Theme, _kb: KeybindingsManager, done: (result: void) => void) => {
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
            {
              stdio: "inherit",
            },
          );
        } else {
          spawnSync("less", [planFile], { stdio: "inherit" });
        }

        tui.start();
        tui.requestRender(true);
        done();
        return { render: () => [], invalidate: () => {} };
      });
    };

    await showPlan();

    let choice: string | undefined;
    do {
      choice = await ctx.ui.select("What would you like to do?", [
        "1. Begin implementing immediately",
        "2. Reset session context, then implement",
        "3. Continue planning",
        "4. Show plan again",
      ]);
      if (choice?.startsWith("4.")) await showPlan();
    } while (choice?.startsWith("4."));

    if (!choice || choice.startsWith("3.")) {
      // Nothing to do — before_agent_start will detect the unacknowledged
      // finish_plan result in the branch and inject the context note.
      return;
    }

    if (choice.startsWith("1.")) {
      const template = await readTemplate(agentDir, "plan-finished");
      if (!template) {
        ctx.ui.notify("finish_plan: could not read plan-finished.md", "error");
        return;
      }
      pi.sendUserMessage(template);
      return;
    }

    if (choice.startsWith("2.")) {
      if (navigateToStart) {
        const template = await readTemplate(agentDir, "implement-plan");
        if (!template) {
          ctx.ui.notify(
            "finish_plan: could not read implement-plan.md",
            "error",
          );
          return;
        }
        await navigateToStart();
        pi.sendUserMessage(template.replaceAll("$PLAN_CONTENTS", planContents));
      } else {
        // agent_end has no navigateTree — queue /finish-plan with-reset
        pi.sendUserMessage("/finish-plan with-reset", {
          deliverAs: "followUp",
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // finish_plan tool — called by the model when the plan is ready
  // ---------------------------------------------------------------------------

  pi.registerTool({
    name: "finish_plan",
    label: "Finish Plan",
    description:
      "Call this tool when the plan is complete and ready for the user to review. " +
      "It ends your turn and presents the user with options: implement now, reset context then implement, or cancel.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      const agentDir = getAgentDir();
      const sessionId = _ctx.sessionManager.getSessionId();
      const planFile = path.join(agentDir, "plans", `${sessionId}.md`);

      if (!existsSync(planFile)) {
        return {
          content: [
            {
              type: "text",
              text: `Error: No plan file found. Write your plan to ${planFile} before using this tool.`,
            },
          ],
          isError: true,
          details: undefined,
        };
      }

      pendingFinishPlan = true;
      return {
        content: [
          {
            type: "text",
            text: "Plan submitted for review. Waiting for user decision.",
          },
        ],
        details: {},
      };
    },
  });

  // ---------------------------------------------------------------------------
  // agent_end — show the plan and prompt for a decision after finish_plan fires
  // ---------------------------------------------------------------------------

  pi.on("agent_end", async (_event, ctx) => {
    // Auto-name the session from the plan file heading if not yet named
    const agentDir = getAgentDir();
    const sessionId = ctx.sessionManager.getSessionId();
    const planFile = path.join(agentDir, "plans", `${sessionId}.md`);

    if (!ctx.sessionManager.getSessionName() && existsSync(planFile)) {
      const title = await readPlanTitle(planFile);
      if (title) pi.setSessionName(title);
    }

    // Only continue if finish_plan was called this turn
    if (!pendingFinishPlan) return;
    pendingFinishPlan = false;

    if (!ctx.hasUI) return;

    await runFinishPlanFlow(agentDir, planFile, ctx);
  });

  // ---------------------------------------------------------------------------
  // before_agent_start — if the most recent finish_plan tool result on the
  // current branch is not already followed by a user message, inject a hidden
  // context note so the model knows the user reviewed but didn't implement.
  // This is session-derived (no flag), so it survives tree navigation.
  // ---------------------------------------------------------------------------

  pi.on("before_agent_start", async (_event, ctx) => {
    // getBranch() returns root→leaf, so reverse to walk leaf→root.
    // We want to find the most recent finish_plan toolResult. If it has no
    // user message between it and the current leaf, inject the context note.
    const branch = [...ctx.sessionManager.getBranch()].reverse();

    for (const entry of branch) {
      const msg = (entry as any)?.message;
      if (!msg) continue;

      if (msg.role === "user") {
        // A user message is more recent than any finish_plan — nothing to inject.
        break;
      }

      if (msg.role === "toolResult" && msg.toolName === "finish_plan") {
        return {
          message: {
            customType: "plan-files-rejected",
            content:
              "The user reviewed the plan and chose not to implement it yet.",
            display: false,
          },
        };
      }
    }
  });

  // ---------------------------------------------------------------------------
  // /finish-plan [now|with-reset]
  //   (no args)    — show full review dialog (open plan, then select action)
  //   now          — skip dialog, implement immediately (option 1)
  //   with-reset   — internal: skip dialog, reset context + implement (option 2),
  //                  queued from agent_end which lacks navigateTree
  // ---------------------------------------------------------------------------

  pi.registerCommand("finish-plan", {
    description:
      "Review the plan. 'now' skips the dialog and begins implementing immediately.",
    handler: async (args, ctx) => {
      const agentDir = getAgentDir();
      const sessionId = ctx.sessionManager.getSessionId();
      const planFile = path.join(agentDir, "plans", `${sessionId}.md`);

      if (!existsSync(planFile)) {
        ctx.ui.notify(
          "finish-plan: no plan file found for this session. Run /plan first.",
          "warning",
        );
        return;
      }

      const navigateToStart = async () => {
        // getBranch() returns root→leaf order, so branch[0] is the oldest entry.
        // Navigate to it so the implement prompt arrives in a near-empty context.
        const branch = ctx.sessionManager.getBranch();
        const firstEntry = branch[0];
        if (firstEntry) {
          await ctx.navigateTree(firstEntry.id, { summarize: false });
        }
      };

      const trimmedArgs = args.trim();

      if (trimmedArgs === "now") {
        const template = await readTemplate(agentDir, "plan-finished");
        if (!template) {
          ctx.ui.notify("finish-plan: could not read plan-finished.md", "error");
          return;
        }
        pi.sendUserMessage(template);
        return;
      }

      if (trimmedArgs === "with-reset") {
        // Jumped here from agent_end — skip dialog, go straight to option 2
        const template = await readTemplate(agentDir, "implement-plan");
        if (!template) {
          ctx.ui.notify("finish-plan: could not read implement-plan.md", "error");
          return;
        }
        let planContents: string;
        try {
          planContents = await fs.readFile(planFile, "utf8");
        } catch {
          ctx.ui.notify("finish-plan: could not read plan file.", "error");
          return;
        }
        await navigateToStart();
        pi.sendUserMessage(template.replaceAll("$PLAN_CONTENTS", planContents));
        return;
      }

      if (!ctx.hasUI) return;
      await runFinishPlanFlow(agentDir, planFile, ctx, navigateToStart);
    },
  });

  // ---------------------------------------------------------------------------
  // /plan command
  // ---------------------------------------------------------------------------

  pi.registerCommand("plan", {
    description:
      "Start a plan-mode session with a session-scoped plan file (~/.pi/agent/plans/<session_id>.md)",
    handler: async (args, ctx) => {
      const agentDir = getAgentDir();
      const plansDir = path.join(agentDir, "plans");
      const sessionId = ctx.sessionManager.getSessionId();
      const planFile = path.join(plansDir, `${sessionId}.md`);

      await fs.mkdir(plansDir, { recursive: true });

      // Try the package's own prompts directory first, then fall back to agentDir.
      const templateCandidates = [
        path.join(PACKAGE_PROMPTS_DIR, "plan.md"),
        path.join(agentDir, "prompts", "plan.md"),
      ];
      let templateContent: string | null = null;
      let templatePath = "";
      for (const candidate of templateCandidates) {
        try {
          templateContent = await fs.readFile(candidate, "utf8");
          templatePath = candidate;
          break;
        } catch {
          // try next
        }
      }
      if (templateContent === null) {
        ctx.ui.notify(
          `plan-files: could not read plan.md (tried: ${templateCandidates.join(", ")})`,
          "error",
        );
        return;
      }

      const body = stripFrontmatter(templateContent);
      const resolved = body.replaceAll("$PLAN_FILE", planFile);
      const message = args?.trim()
        ? `${resolved}\n\n## Task\n\n${args.trim()}`
        : resolved;

      ctx.ui.notify(`Plan file: ${planFile}`, "info");
      pi.sendUserMessage(message, { deliverAs: "followUp" });
    },
  });

  // ---------------------------------------------------------------------------
  // /plans command
  // ---------------------------------------------------------------------------

  pi.registerCommand("plans", {
    description: "List existing plan files in ~/.pi/agent/plans/",
    handler: async (_args, ctx) => {
      const agentDir = getAgentDir();
      const plansDir = path.join(agentDir, "plans");

      if (!existsSync(plansDir)) {
        ctx.ui.notify(
          "No plan files found (plans directory does not exist yet).",
          "info",
        );
        return;
      }

      let files: string[];
      try {
        files = await fs.readdir(plansDir);
      } catch (err) {
        ctx.ui.notify(
          `plan-files: could not read ${plansDir}: ${err}`,
          "error",
        );
        return;
      }

      const mdFiles = files.filter((f) => f.endsWith(".md")).sort();

      if (mdFiles.length === 0) {
        ctx.ui.notify("No plan files found.", "info");
        return;
      }

      const sessionId = ctx.sessionManager.getSessionId();
      const currentPlanFile = `${sessionId}.md`;

      const lines = await Promise.all(
        mdFiles.map(async (f) => {
          const marker = f === currentPlanFile ? " ← current session" : "";
          const filePath = path.join(plansDir, f);
          const title = existsSync(filePath)
            ? await readPlanTitle(filePath)
            : null;
          const titleSuffix = title ? `  (${title})` : "";
          return `  ${filePath}${titleSuffix}${marker}`;
        }),
      );

      ctx.ui.notify(
        `Plan files (${mdFiles.length}):\n${lines.join("\n")}`,
        "info",
      );
    },
  });
}
