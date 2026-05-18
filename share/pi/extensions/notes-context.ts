/**
 * If $NOTES_DIR is set, appends all AGENTS.md files found in immediate
 * subdirectories of $NOTES_DIR to the system prompt. Frontmatter is stripped.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function stripFrontmatter(content: string): string {
  if (!content.startsWith("---\n")) return content;
  const end = content.indexOf("\n---\n", 4);
  if (end === -1) return content;
  return content.slice(end + 5);
}

function findAgentsFiles(notesDir: string): string[] {
  try {
    return readdirSync(notesDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => join(notesDir, e.name, "AGENTS.md"))
      .filter((f) => {
        try { readFileSync(f); return true; } catch { return false; }
      });
  } catch {
    return [];
  }
}

export default function (pi: ExtensionAPI) {
  const notesDir = process.env.NOTES_DIR;
  if (!notesDir) return;

  pi.on("before_agent_start", (event) => {
    const files = findAgentsFiles(notesDir);
    if (files.length === 0) return;
    const sections = files.map((f) => {
      const raw = readFileSync(f, "utf-8");
      return `## ${f}\n\n${stripFrontmatter(raw)}`;
    });
    const appended = `\n\n${sections.join("\n\n")}\n\n`;
    return { systemPrompt: event.systemPrompt + appended };
  });
}
