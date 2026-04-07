/**
 * System Assistant Extension
 *
 * Flags:
 *   --system-assistant  Enable system assistant mode:
 *     - Strip repository-level AGENTS.md from the system prompt
 *     - Prompt the user before every bash, read, write, and edit invocation
 *     - Execute bash commands (agent and ! user commands) via $SHELL
 *
 *   --completion         Enable command completion mode (requires --system-assistant):
 *     - Registers set_command tool for proposing shell commands
 *     - Injects system prompt guidance to prefer set_command over running commands
 *     - /accept writes the current command to fd 100 and exits
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

const GATED_TOOLS = new Set(["bash", "read", "write", "edit"]);

export default function (pi: ExtensionAPI) {
  const isActive = () => !!pi.getFlag("system-assistant");
  const isCompletion = () => !!pi.getFlag("completion");

  // --- Flag registration ---
  pi.registerFlag("system-assistant", {
    description:
      "Enable system assistant mode (interactive tool approval, $SHELL execution, no repo context)",
    type: "boolean",
    default: false,
  });

  // --- Force quiet startup in completion mode ---
  // Flags aren't available at load time, so check process.argv directly.
  // We temporarily set the global setting and restore it on session_start.
  // TODO: upstream
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

  // --- Bash tool override: execute via $SHELL ---
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
      async execute(id, params, signal, onUpdate, ctx) {
        if (isActive()) {
          return shellBash.execute(id, params, signal, onUpdate);
        }
        return defaultBash.execute(id, params, signal, onUpdate);
      },
    });
  }

  // --- Interactive permission prompting for bash/read/write/edit ---
  pi.on("tool_call", async (event, ctx) => {
    if (!isActive()) return undefined;
    if (!GATED_TOOLS.has(event.toolName)) return undefined;

    if (!ctx.hasUI) {
      return {
        block: true,
        reason:
          "System assistant mode requires interactive approval (no UI available)",
      };
    }

    let summary: string;
    switch (event.toolName) {
      case "bash":
        summary = `bash: ${event.input.command}`;
        break;
      case "read":
        summary = `read: ${event.input.path}`;
        break;
      case "write":
        summary = `write: ${event.input.path}`;
        break;
      case "edit":
        summary = `edit: ${event.input.path}`;
        break;
      default:
        summary = `${event.toolName}: ${JSON.stringify(event.input)}`;
    }

    const approved = await ctx.ui.confirm("🔒 Approve?", summary);

    if (!approved) {
      return { block: true, reason: "Blocked by user" };
    }

    return undefined;
  });

  // --- User bash (! commands) via $SHELL ---
  pi.on("user_bash", (event, _ctx) => {
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
  });

  // --- Command completion mode ---
  pi.registerFlag("completion", {
    description:
      "Enable command completion mode (set_command tool, /accept to emit)",
    type: "boolean",
    default: false,
  });

  // --- Command completion mode (tools & commands) ---
  if (process.argv.includes("--completion")) {
    let currentCommand: string | null = null;

    // Reconstruct command state from session history
    const reconstructCommand = (ctx: ExtensionContext) => {
      currentCommand = null;
      for (const entry of ctx.sessionManager.getBranch()) {
        if (entry.type !== "message") continue;
        const msg = entry.message;
        if (msg.role !== "toolResult" || msg.toolName !== "set_command")
          continue;
        const details = msg.details as { command: string } | undefined;
        if (details) {
          currentCommand = details.command;
        }
      }
    };

    pi.on("session_start", async (_event, ctx) => {
      reconstructCommand(ctx);
    });

    pi.registerTool({
      name: "set_command",
      label: "set_command",
      description:
        "Set the command to be returned to the caller. The user will be prompted to accept or continue iterating.",
      parameters: Type.Object({
        command: Type.String({ description: "The shell command to propose" }),
      }),
      async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
        currentCommand = params.command;

        // Prompt user to accept or continue iterating
        if (ctx.hasUI) {
          const accepted = await ctx.ui.confirm(
            "📋 Accept command?",
            currentCommand,
          );

          if (accepted) {
            try {
              writeSync(100, currentCommand);
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
                  text: `Command accepted: ${currentCommand}`,
                },
              ],
              details: { command: currentCommand },
            };
          }
        }

        return {
          content: [
            {
              type: "text",
              text: `Command set (waiting for changes or /accept): ${currentCommand}`,
            },
          ],
          details: { command: currentCommand },
        };
      },
    });

    const acceptCommand = async (ctx: ExtensionContext) => {
      reconstructCommand(ctx);

      if (!currentCommand) {
        ctx.ui.notify("No command has been set yet", "warning");
        return;
      }

      try {
        writeSync(100, currentCommand);
        closeSync(100);
      } catch (e: any) {
        ctx.ui.notify(`Failed to write to fd 100: ${e.message}`, "warning");
      }

      // TODO: not possible to install /accept as a keyboard shortcut because then this won't work.
      ctx.shutdown();
    };

    pi.registerCommand("accept", {
      description: "Accept the current command and exit",
      handler: async (_args, ctx) => {
        await acceptCommand(ctx);
      },
    });
  }

  // --- Strip repository-level AGENTS.md from system prompt ---
  pi.on("before_agent_start", async (event, _ctx) => {
    if (!isActive()) return undefined;

    let prompt = event.systemPrompt;
    const home = process.env.HOME || "";

    // Context files are injected under "# Project Context" as:
    //   ## /absolute/path/AGENTS.md\n\n<content>\n\n
    // Each section runs until the next "## " header or a known trailing
    // marker ("\nCurrent date:"). Keep global ~/.pi/ files, strip the rest.
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

    return { systemPrompt: prompt };
  });
}
