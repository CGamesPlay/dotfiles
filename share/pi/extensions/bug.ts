/**
 * Bug Report Extension
 *
 * Provides a /bug command to quickly create timestamped bug reports with
 * session info, process info, and git state.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
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
}
