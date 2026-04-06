/**
 * System Assistant Mode
 *
 * Provides flag registration, tool gating logic, bash $SHELL override,
 * set_command tool, /accept command, and system prompt modification.
 */

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import {
  createBashTool,
  createLocalBashOperations,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { writeSync, closeSync } from "fs";
import type { AppState } from "../state.js";

const GATED_TOOLS = new Set(["bash", "read", "write", "edit"]);

// ─── Flag Registration ────────────────────────────────────────────────────────

export function registerSystemAssistantFlags(pi: ExtensionAPI) {
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

  // Force quiet startup in completion mode
  if (process.argv.includes("--completion")) {
    const settings = SettingsManager.create();
    const wasQuiet = settings.getQuietStartup();
    if (!wasQuiet) {
      settings.setQuietStartup(true);
      pi.on("session_start", async () => {
        settings.setQuietStartup(false);
      });
    }
  }
}

// ─── Tool Registration ────────────────────────────────────────────────────────

export function registerSystemAssistantTools(
  state: AppState,
  pi: ExtensionAPI,
) {
  const isActive = () => !!pi.getFlag("system-assistant");

  // Bash tool override: execute via $SHELL
  if (process.argv.includes("--system-assistant")) {
    const cwd = process.cwd();
    const defaultBash = createBashTool(cwd);
    const shellBash = createBashTool(cwd, {
      spawnHook: ({ command, cwd, env }) => ({
        command: `exec ${process.env.SHELL || "/bin/sh"} -c ${JSON.stringify(command)}`,
        cwd,
        env,
      }),
    });

    pi.registerTool({
      ...defaultBash,
      async execute(id, params, signal, onUpdate, _ctx) {
        if (isActive()) {
          return shellBash.execute(id, params, signal, onUpdate);
        }
        return defaultBash.execute(id, params, signal, onUpdate);
      },
    });
  }

  // Command completion mode tools
  if (process.argv.includes("--completion")) {
    pi.registerTool({
      name: "set_command",
      label: "set_command",
      description:
        "Set the command to be returned to the caller. The user will be prompted to accept or continue iterating.",
      parameters: Type.Object({
        command: Type.String({ description: "The shell command to propose" }),
      }),
      async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
        state.completion.currentCommand = params.command;

        if (ctx.hasUI) {
          const accepted = await ctx.ui.confirm(
            "📋 Accept command?",
            state.completion.currentCommand,
          );

          if (accepted) {
            try {
              writeSync(100, state.completion.currentCommand);
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
                  text: `Command accepted: ${state.completion.currentCommand}`,
                },
              ],
              details: { command: state.completion.currentCommand },
            };
          }
        }

        return {
          content: [
            {
              type: "text",
              text: `Command set (waiting for changes or /accept): ${state.completion.currentCommand}`,
            },
          ],
          details: { command: state.completion.currentCommand },
        };
      },
    });
  }
}

// ─── Command Registration ──────────────────────────────────────────────────────

export function registerSystemAssistantCommands(
  state: AppState,
  pi: ExtensionAPI,
) {
  if (!process.argv.includes("--completion")) return;

  const reconstructCommand = (ctx: ExtensionContext) => {
    state.completion.currentCommand = null;
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type !== "message") continue;
      const msg = entry.message;
      if (msg.role !== "toolResult" || msg.toolName !== "set_command") continue;
      const details = msg.details as { command: string } | undefined;
      if (details) {
        state.completion.currentCommand = details.command;
      }
    }
  };

  // Reconstruct on session_start
  pi.on("session_start", async (_event, ctx) => {
    reconstructCommand(ctx);
  });

  const acceptCommand = (ctx: ExtensionContext) => {
    reconstructCommand(ctx);

    if (!state.completion.currentCommand) {
      ctx.ui.notify("No command has been set yet", "warning");
      return;
    }

    try {
      writeSync(100, state.completion.currentCommand);
      closeSync(100);
    } catch (e: any) {
      ctx.ui.notify(`Failed to write to fd 100: ${e.message}`, "warning");
    }

    ctx.shutdown();
  };

  pi.registerCommand("accept", {
    description: "Accept the current command and exit",
    handler: async (_args, ctx) => {
      acceptCommand(ctx);
    },
  });
}

// ─── Tool Gating ───────────────────────────────────────────────────────────────

export function gateToolCall(
  pi: ExtensionAPI,
  event: any,
  ctx: any,
): { block: true; reason: string } | undefined {
  const isActive = () => !!pi.getFlag("system-assistant");
  if (!isActive()) return undefined;
  if (!GATED_TOOLS.has(event.toolName)) return undefined;

  if (!ctx.hasUI) {
    return {
      block: true,
      reason:
        "System assistant mode requires interactive approval (no UI available)",
    };
  }

  // Note: the actual confirm() call must be done in the hook handler
  // since it's async and we need to return the result.
  // This function returns undefined to indicate "needs prompting".
  return undefined;
}

/** Build the confirm summary for a gated tool call */
export function getGateSummary(event: any): string {
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

// ─── System Prompt Modification ────────────────────────────────────────────────

export function modifySystemPrompt(
  pi: ExtensionAPI,
  prompt: string,
): string | undefined {
  const isActive = () => !!pi.getFlag("system-assistant");
  const isCompletion = () => !!pi.getFlag("completion");
  if (!isActive()) return undefined;

  const home = process.env.HOME || "";

  // Strip repository-level AGENTS.md, keep global ~/.pi/ files
  prompt = prompt.replace(
    /## (\/[^\n]*?AGENTS\.md)\n\n[\s\S]*?(?=## \/|\nCurrent date:)/g,
    (match, path: string) => {
      if (path.startsWith(`${home}/.pi/`)) return match;
      return "";
    },
  );

  // Inject completion mode note
  if (isCompletion()) {
    const shell = process.env.SHELL || "/bin/sh";
    prompt += `\n\n# Command Completion Mode\n\nCommand completion mode is active. The user's shell is \`${shell}\`. Your goal is to help construct a shell command. Use the \`set_command\` tool to propose commands rather than running them directly. The user will review and accept the final command with \`/accept\`. Iterate based on feedback. Only use bash to test or gather information if needed, not to execute the final command.`;
  }

  return prompt;
}

// ─── User Bash Override ────────────────────────────────────────────────────────

export function overrideUserBash(pi: ExtensionAPI): any {
  const isActive = () => !!pi.getFlag("system-assistant");
  if (!isActive()) return undefined;

  const local = createLocalBashOperations();
  const shell = process.env.SHELL || "/bin/sh";
  return {
    operations: {
      exec(command: string, cwd: string, options: any) {
        return local.exec(
          `exec ${shell} -c ${JSON.stringify(command)}`,
          cwd,
          options,
        );
      },
    },
  };
}
