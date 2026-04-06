/**
 * Plan Workflow
 *
 * Provides the finish_plan tool, /plan, /finish-plan, /plans commands,
 * and the interactive review dialog flow.
 */

import type {
  ExtensionAPI,
  ExtensionUIContext,
  KeybindingsManager,
} from "@mariozechner/pi-coding-agent";
import type { Theme } from "@mariozechner/pi-coding-agent";
import type { TUI } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import type { AppState } from "../state.js";

// Directory of the package's bundled prompts (share/pi/prompts/)
const PACKAGE_PROMPTS_DIR = path.resolve(
  fileURLToPath(import.meta.url),
  "..",
  "..",
  "..",
  "..",
  "prompts",
);

// ─── Helpers ───────────────────────────────────────────────────────────────────

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

// ─── Review Flow ───────────────────────────────────────────────────────────────

export async function runFinishPlanFlow(
  _state: AppState,
  pi: ExtensionAPI,
  agentDir: string,
  planFile: string,
  ctx: { ui: ExtensionUIContext; hasUI: boolean },
  navigateToStart?: () => Promise<void>,
) {
  let planContents: string;
  try {
    planContents = await fs.readFile(planFile, "utf8");
  } catch {
    ctx.ui.notify("finish_plan: could not read plan file.", "error");
    return;
  }

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
        ctx.ui.notify("finish_plan: could not read implement-plan.md", "error");
        return;
      }
      await navigateToStart();
      pi.sendUserMessage(template.replaceAll("$PLAN_CONTENTS", planContents));
    } else {
      pi.sendUserMessage("/finish-plan with-reset", {
        deliverAs: "followUp",
      });
    }
  }
}

/** Auto-name session from plan file heading if not yet named */
export async function autoNameSessionFromPlan(
  _state: AppState,
  pi: ExtensionAPI,
  ctx: {
    sessionManager: {
      getSessionId(): string;
      getSessionName?(): string | undefined;
    };
  },
) {
  const agentDir = getAgentDir();
  const sessionId = ctx.sessionManager.getSessionId();
  const planFile = path.join(agentDir, "plans", `${sessionId}.md`);

  const hasName =
    typeof ctx.sessionManager.getSessionName === "function"
      ? ctx.sessionManager.getSessionName()
      : pi.getSessionName();

  if (!hasName && existsSync(planFile)) {
    const title = await readPlanTitle(planFile);
    if (title) pi.setSessionName(title);
  }
}

// ─── Registration ──────────────────────────────────────────────────────────────

export function registerPlanningTools(state: AppState, pi: ExtensionAPI) {
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

      state.plan.pendingFinishPlan = true;
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
}

export function registerPlanningCommands(state: AppState, pi: ExtensionAPI) {
  // /finish-plan [now|with-reset]
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
          ctx.ui.notify(
            "finish-plan: could not read plan-finished.md",
            "error",
          );
          return;
        }
        pi.sendUserMessage(template);
        return;
      }

      if (trimmedArgs === "with-reset") {
        const template = await readTemplate(agentDir, "implement-plan");
        if (!template) {
          ctx.ui.notify(
            "finish-plan: could not read implement-plan.md",
            "error",
          );
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
      await runFinishPlanFlow(
        state,
        pi,
        agentDir,
        planFile,
        ctx,
        navigateToStart,
      );
    },
  });

  // /plan command
  pi.registerCommand("plan", {
    description:
      "Start a plan-mode session with a session-scoped plan file (~/.pi/agent/plans/<session_id>.md)",
    handler: async (args, ctx) => {
      const agentDir = getAgentDir();
      const plansDir = path.join(agentDir, "plans");
      const sessionId = ctx.sessionManager.getSessionId();
      const planFile = path.join(plansDir, `${sessionId}.md`);

      await fs.mkdir(plansDir, { recursive: true });

      const templateCandidates = [
        path.join(PACKAGE_PROMPTS_DIR, "plan.md"),
        path.join(agentDir, "prompts", "plan.md"),
      ];
      let templateContent: string | null = null;
      for (const candidate of templateCandidates) {
        try {
          templateContent = await fs.readFile(candidate, "utf8");
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

  // /plans command
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
