import { rewriteSkillAliasPath } from "./settings.js";

export const MCP_SERVER_NAME = "pi";
export const MCP_TOOL_PREFIX = `mcp__${MCP_SERVER_NAME}__`;

/**
 * Strip the MCP prefix the SDK adds to tool names. Pi knows tools by their
 * registered name; the model sees `mcp__pi__<name>` and we surface `<name>`.
 */
export function sdkToolNameToPi(name: string): string {
  if (name.startsWith(MCP_TOOL_PREFIX)) {
    return name.slice(MCP_TOOL_PREFIX.length);
  }
  return name;
}

export function piToolNameToSdk(name: string): string {
  if (name.startsWith(MCP_TOOL_PREFIX)) return name;
  return `${MCP_TOOL_PREFIX}${name}`;
}

/**
 * Walk a tool argument object and rewrite any `~/.claude/skills` /
 * `.claude/skills` paths back to their pi-side locations. Used when the
 * session has the skills append in effect.
 *
 * Conservative: rewrites only top-level string fields whose name suggests a
 * path. Argument shapes are pi-specific (we no longer translate from
 * Claude-style argument names), so we don't need the per-tool special cases
 * the previous design used.
 */
const PATH_FIELD_NAMES = new Set([
  "path",
  "file_path",
  "directory",
  "dir",
  "cwd",
]);

export function maybeRewriteSkillAliasArgs(
  args: Record<string, unknown> | undefined,
  allowSkillAliasRewrite: boolean,
): Record<string, unknown> {
  if (!args) return {};
  if (!allowSkillAliasRewrite) return args;
  let copy: Record<string, unknown> | undefined;
  for (const key of Object.keys(args)) {
    if (!PATH_FIELD_NAMES.has(key)) continue;
    const value = args[key];
    const rewritten = rewriteSkillAliasPath(value);
    if (rewritten !== value) {
      if (!copy) copy = { ...args };
      copy[key] = rewritten;
    }
  }
  return copy ?? args;
}
