/**
 * System Assistant Extension
 *
 * Two flags:
 *   --system-assistant: interactive tool-approval gate, $SHELL bash execution,
 *                       stripped repo-level AGENTS.md from the system prompt.
 *   --completion:       agent proposes shell commands via the `set_command`
 *                       tool; `/accept` writes the chosen command to fd 100.
 */

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  createBashToolDefinition,
  createLocalBashOperations,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { writeSync, closeSync } from "fs";

const GATED_TOOLS = new Set(["bash", "read", "write", "edit"]);

interface State {
  currentCommand: string | null;
}

export default function (pi: ExtensionAPI) {
  const state: State = { currentCommand: null };

  pi.registerFlag("system-assistant", {
    description:
      "Enable system assistant mode (interactive tool approval, $SHELL execution, no repo context)",
    type: "boolean",
    default: false,
  });

  pi.registerFlag("completion", {
    description:
      "Enable command completion mode (set_command tool, /accept to emit)",
    type: "boolean",
    default: false,
  });

  const isSystemAssistant = () => !!pi.getFlag("system-assistant");
  const isCompletion = () => !!pi.getFlag("completion");

  // Force quiet startup in completion mode. Flag values aren't applied until
  // after extension load, so we detect via argv here.
  if (process.argv.includes("--completion")) {
    const settings = SettingsManager.create(".");
    if (!settings.getQuietStartup()) {
      settings.setQuietStartup(true);
      pi.on("session_start", async () => {
        settings.setQuietStartup(false);
      });
    }
  }

  // ── $SHELL bash override ─────────────────────────────────────────────────
  if (process.argv.includes("--system-assistant")) {
    const cwd = process.cwd();
    const defaultBash = createBashToolDefinition(cwd);
    const shellBash = createBashToolDefinition(cwd, {
      spawnHook: ({ command, cwd, env }) => ({
        command: `exec ${process.env.SHELL || "/bin/sh"} -c ${shellSingleQuote(command)}`,
        cwd,
        env,
      }),
    });

    pi.registerTool({
      ...defaultBash,
      async execute(id, params, signal, onUpdate, ctx) {
        return isSystemAssistant()
          ? shellBash.execute(id, params, signal, onUpdate, ctx)
          : defaultBash.execute(id, params, signal, onUpdate, ctx);
      },
    });
  }

  // ── set_command tool ─────────────────────────────────────────────────────
  if (process.argv.includes("--completion")) {
    pi.registerTool({
      name: "set_command",
      label: "set_command",
      description:
        "Set the command to be returned to the caller. The user will be prompted to accept or continue iterating.",
      promptSnippet: "Propose a revised command for the user to run.",
      promptGuidelines: [
        "The goal of this session is to give the user the correct command via set_command. Don't attempt to run the command yourself.",
      ],
      parameters: Type.Object({
        command: Type.String({ description: "The shell command to propose" }),
      }),
      async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
        state.currentCommand = params.command;

        if (ctx.hasUI) {
          const accepted = await ctx.ui.confirm(
            "📋 Accept command?",
            state.currentCommand,
          );

          if (accepted) {
            try {
              writeSync(100, state.currentCommand);
              closeSync(100);
            } catch (e: any) {
              ctx.ui.notify(
                `Failed to write to fd 100: ${e.message}`,
                "warning",
              );
            }
            ctx.abort();
            ctx.shutdown();
            return {
              content: [
                {
                  type: "text",
                  text: `Command accepted: ${state.currentCommand}`,
                },
              ],
              details: { command: state.currentCommand },
            };
          }
        }

        return {
          content: [
            {
              type: "text",
              text: `Command set (waiting for changes or /accept): ${state.currentCommand}`,
            },
          ],
          details: { command: state.currentCommand },
        };
      },
    });

    // ── /accept command ───────────────────────────────────────────────────
    const reconstructCommand = (ctx: ExtensionContext) => {
      state.currentCommand = null;
      for (const entry of ctx.sessionManager.getBranch()) {
        if (entry.type !== "message") continue;
        const msg = entry.message;
        if (msg.role !== "toolResult" || msg.toolName !== "set_command")
          continue;
        const details = msg.details as { command: string } | undefined;
        if (details) state.currentCommand = details.command;
      }
    };

    pi.on("session_start", async (_event, ctx) => {
      reconstructCommand(ctx);
    });

    pi.registerCommand("accept", {
      description: "Accept the current command and exit",
      handler: async (_args, ctx) => {
        reconstructCommand(ctx);
        if (!state.currentCommand) {
          ctx.ui.notify("No command has been set yet", "warning");
          return;
        }
        try {
          writeSync(100, state.currentCommand);
          closeSync(100);
        } catch (e: any) {
          ctx.ui.notify(`Failed to write to fd 100: ${e.message}`, "warning");
        }
        ctx.shutdown();
      },
    });
  }

  // ── Tool gating ──────────────────────────────────────────────────────────
  pi.on("tool_call", async (event, ctx) => {
    if (!isSystemAssistant()) return;
    if (!GATED_TOOLS.has(event.toolName)) return;

    if (!ctx.hasUI) {
      return {
        block: true,
        reason:
          "System assistant mode requires interactive approval (no UI available)",
      };
    }

    const summary = gateSummary(event);
    const approved = await ctx.ui.confirm("🔒 Approve?", summary);
    if (!approved) return { block: true, reason: "Blocked by user" };
  });

  // ── $SHELL override for user bash (Ctrl-! and similar) ───────────────────
  pi.on("user_bash", async () => {
    if (!isSystemAssistant()) return undefined;
    const local = createLocalBashOperations();
    const shell = process.env.SHELL || "/bin/sh";
    return {
      operations: {
        exec(command: string, cwd: string, options: any) {
          return local.exec(
            `exec ${shell} -c ${shellSingleQuote(command)}`,
            cwd,
            options,
          );
        },
      },
    };
  });

  // ── System prompt modification ───────────────────────────────────────────
  pi.on("before_agent_start", async (event) => {
    if (!isSystemAssistant()) return;

    const home = process.env.HOME || "";
    let prompt = event.systemPrompt;

    // Strip repository-level AGENTS.md sections, keep global ~/.pi/ files.
    prompt = prompt.replace(
      /## (\/[^\n]*?AGENTS\.md)\n\n[\s\S]*?(?=## \/|\nCurrent date:)/g,
      (match, p: string) => (p.startsWith(`${home}/.pi/`) ? match : ""),
    );

    if (isCompletion()) {
      const shell = process.env.SHELL || "/bin/sh";
      prompt += `\n\n# Command Completion Mode\n\nCommand completion mode is active. The user's shell is \`${shell}\`. Your goal is to help construct a shell command. Use the \`set_command\` tool to propose commands rather than running them directly. The user will review and accept the final command with \`/accept\`. Iterate based on feedback. Only use bash to test or gather information if needed, not to execute the final command.`;
    }

    return { systemPrompt: prompt };
  });
}

function shellSingleQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''")
    + "'";
}

function gateSummary(event: any): string {
  switch (event.toolName) {
    case "bash":
      return `bash: ${event.input.command}`;
    case "read":
      return `read: ${event.input.path}`;
    case "write":
      return `write: ${event.input.path}`;
    case "edit":
      return `edit: ${event.input.path}`;
    default:
      return `${event.toolName}: ${JSON.stringify(event.input)}`;
  }
}
