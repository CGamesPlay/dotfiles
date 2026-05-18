/**
 * Bug Report Extension
 *
 * Provides a /bug command to quickly create timestamped bug reports with
 * session info, process info, and git state.
 *
 * Also provides /debug-system-prompt, which captures the fully assembled
 * system prompt by triggering a turn, intercepting it in `before_agent_start`
 * after all other extensions have had a chance to modify it, aborting the
 * turn, and viewing the captured payload in $PAGER.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("bug", {
    description: "Create a bug report with session and system info",
    handler: async (message, ctx) => {
      const bugsDir = join(homedir(), ".pi", "agent", "bugs");
      const dfmDir = process.env.DFM_DIR ?? ctx.cwd;

      // Ensure bugs directory exists
      if (!existsSync(bugsDir)) {
        mkdirSync(bugsDir, { recursive: true });
      }

      // Create timestamped filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = join(bugsDir, `bug-${timestamp}.txt`);

      // Gather information
      const sessionId = ctx.sessionManager.getSessionFile() ?? "ephemeral";
      const entries = ctx.sessionManager.getEntries();
      const currentMessageId =
        entries.length > 0 ? entries[entries.length - 1].id : "none";

      let gitCommit: string;
      let gitStatus: string;

      try {
        gitCommit = execSync("git rev-parse HEAD", {
          cwd: dfmDir,
          encoding: "utf-8",
        }).trim();
      } catch {
        gitCommit = "Not a git repo or no commits";
      }

      try {
        gitStatus =
          execSync("git status --short", {
            cwd: dfmDir,
            encoding: "utf-8",
          }).trim() || "clean";
      } catch {
        gitStatus = "Failed to get git status";
      }

      // Write bug report
      const content = `Bug Report: ${message}

Timestamp: ${new Date().toISOString()}
Session ID: ${sessionId}
Current Message ID: ${currentMessageId}

---
Git Commit (DFM_DIR):
${gitCommit}

---
Git Status (DFM_DIR):
${gitStatus}
`;

      writeFileSync(filename, content, "utf-8");

      // Print just the filename using pi's UI
      ctx.ui.notify(filename, "info");
    },
  });

  type Capture = {
    resolve: (systemPrompt: string) => void;
    reject: (err: Error) => void;
  };

  let pendingCapture: Capture | undefined;
  let listenerInstalled = false;

  function installListenerOnce() {
    if (listenerInstalled) return;
    listenerInstalled = true;

    // Registered lazily so it fires after all extension init-time hooks.
    pi.on("before_agent_start", (event, ctx) => {
      if (!pendingCapture) return;
      const capture = pendingCapture;
      pendingCapture = undefined;
      capture.resolve(event.systemPrompt);
      ctx.abort();
    });
  }

  pi.registerCommand("debug-system-prompt", {
    description:
      "Dump the fully assembled system prompt and open it in $PAGER",
    handler: async (_args, ctx) => {
      installListenerOnce();

      if (pendingCapture) {
        ctx.ui.notify(
          "A previous /debug-system-prompt is still running",
          "warning",
        );
        return;
      }

      await ctx.waitForIdle();

      const system = await new Promise<string>((resolve, reject) => {
        pendingCapture = { resolve, reject };
        try {
          pi.sendUserMessage(".");
        } catch (err) {
          pendingCapture = undefined;
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });

      const tools = pi.getAllTools().map(({ name, description, parameters }) => ({
        name,
        description,
        parameters,
      }));

      const rendered = `${system}\n\n## Tools\n\n\`\`\`json\n${JSON.stringify(tools, null, 2)}\n\`\`\`\n`;

      const path = join(tmpdir(), `pi-system-prompt-${Date.now()}.md`);
      writeFileSync(path, rendered);

      const pager = process.env.PAGER || "less";

      await ctx.ui.custom<void>((tui, _theme, _kb, done) => {
        tui.stop();
        process.stdout.write("\x1b[2J\x1b[H");

        spawnSync(pager, [path], {
          stdio: "inherit",
          env: process.env,
          shell: true,
        });

        tui.start();
        tui.requestRender(true);
        done();

        return { render: () => [], invalidate: () => {} };
      });

      ctx.ui.notify(`System prompt written to ${path}`, "info");
    },
  });
}
