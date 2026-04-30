import type { SettingSource } from "@anthropic-ai/claude-agent-sdk";
import { existsSync, readFileSync } from "fs";
import { createRequire } from "module";
import { homedir } from "os";
import { dirname, join, relative, resolve } from "path";

export const SKILLS_ALIAS_GLOBAL = "~/.claude/skills";
export const SKILLS_ALIAS_PROJECT = ".claude/skills";
const GLOBAL_SKILLS_ROOT = join(homedir(), ".pi", "agent", "skills");
const PROJECT_SKILLS_ROOT = join(process.cwd(), ".pi", "skills");
const GLOBAL_SETTINGS_PATH = join(homedir(), ".pi", "agent", "settings.json");
const PROJECT_SETTINGS_PATH = join(process.cwd(), ".pi", "settings.json");
const GLOBAL_AGENTS_PATH = join(homedir(), ".pi", "agent", "AGENTS.md");

export type ProviderSettings = {
  appendSystemPrompt?: boolean;
  settingSources?: SettingSource[];
  strictMcpConfig?: boolean;
};

export function loadProviderSettings(): ProviderSettings {
  const globalSettings = readSettingsFile(GLOBAL_SETTINGS_PATH);
  const projectSettings = readSettingsFile(PROJECT_SETTINGS_PATH);
  return { ...globalSettings, ...projectSettings };
}

function readSettingsFile(filePath: string): ProviderSettings {
  if (!existsSync(filePath)) return {};
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const settingsBlock =
      (parsed["claudeAgentSdkProvider"] as
        | Record<string, unknown>
        | undefined) ??
      (parsed["claude-agent-sdk-provider"] as
        | Record<string, unknown>
        | undefined) ??
      (parsed["claudeAgentSdk"] as Record<string, unknown> | undefined);
    if (!settingsBlock || typeof settingsBlock !== "object") return {};

    const appendSystemPrompt =
      typeof settingsBlock["appendSystemPrompt"] === "boolean"
        ? (settingsBlock["appendSystemPrompt"] as boolean)
        : undefined;

    const settingSourcesRaw = settingsBlock["settingSources"];
    const settingSources =
      Array.isArray(settingSourcesRaw) &&
      settingSourcesRaw.every(
        (value) =>
          typeof value === "string" &&
          (value === "user" || value === "project" || value === "local"),
      )
        ? (settingSourcesRaw as SettingSource[])
        : undefined;

    const strictMcpConfig =
      typeof settingsBlock["strictMcpConfig"] === "boolean"
        ? (settingsBlock["strictMcpConfig"] as boolean)
        : undefined;

    return { appendSystemPrompt, settingSources, strictMcpConfig };
  } catch {
    return {};
  }
}

/**
 * Pi rewrites skills' on-disk locations into ~/.claude/skills aliases when
 * forwarding to Claude Code so the model sees a Claude-native layout. We
 * extract that block out of pi's full system prompt and re-attach it via
 * `systemPrompt.append`, leaving the rest of the prompt to come from the
 * `claude_code` preset.
 */
export function extractSkillsAppend(systemPrompt?: string): string | undefined {
  if (!systemPrompt) return undefined;
  const startMarker =
    "The following skills provide specialized instructions for specific tasks.";
  const endMarker = "</available_skills>";
  const startIndex = systemPrompt.indexOf(startMarker);
  if (startIndex === -1) return undefined;
  const endIndex = systemPrompt.indexOf(endMarker, startIndex);
  if (endIndex === -1) return undefined;
  const skillsBlock = systemPrompt
    .slice(startIndex, endIndex + endMarker.length)
    .trim();
  return rewriteSkillsLocations(skillsBlock);
}

function rewriteSkillsLocations(skillsBlock: string): string {
  return skillsBlock.replace(
    /<location>([^<]+)<\/location>/g,
    (_match, location: string) => {
      let rewritten = location;
      if (location.startsWith(GLOBAL_SKILLS_ROOT)) {
        const relPath = relative(GLOBAL_SKILLS_ROOT, location).replace(
          /^\.+/,
          "",
        );
        rewritten = `${SKILLS_ALIAS_GLOBAL}/${relPath}`.replace(/\/\/+/g, "/");
      } else if (location.startsWith(PROJECT_SKILLS_ROOT)) {
        const relPath = relative(PROJECT_SKILLS_ROOT, location).replace(
          /^\.+/,
          "",
        );
        rewritten = `${SKILLS_ALIAS_PROJECT}/${relPath}`.replace(/\/\/+/g, "/");
      }
      return `<location>${rewritten}</location>`;
    },
  );
}

export function extractAgentsAppend(): string | undefined {
  const agentsPath = resolveAgentsMdPath();
  if (!agentsPath) return undefined;
  try {
    const content = readFileSync(agentsPath, "utf-8").trim();
    if (!content) return undefined;
    const sanitized = sanitizeAgentsContent(content);
    return sanitized.length > 0 ? `# CLAUDE.md\n\n${sanitized}` : undefined;
  } catch {
    return undefined;
  }
}

function resolveAgentsMdPath(): string | undefined {
  const fromCwd = findAgentsMdInParents(process.cwd());
  if (fromCwd) return fromCwd;
  if (existsSync(GLOBAL_AGENTS_PATH)) return GLOBAL_AGENTS_PATH;
  return undefined;
}

function findAgentsMdInParents(startDir: string): string | undefined {
  let current = resolve(startDir);
  while (true) {
    const candidate = join(current, "AGENTS.md");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return undefined;
}

function sanitizeAgentsContent(content: string): string {
  let sanitized = content;
  sanitized = sanitized.replace(/~\/\.pi\b/gi, "~/.claude");
  sanitized = sanitized.replace(/(^|[\s'"`])\.pi\//g, "$1.claude/");
  sanitized = sanitized.replace(/\b\.pi\b/gi, ".claude");
  sanitized = sanitized.replace(/\bpi\b/gi, "environment");
  return sanitized;
}

/**
 * Reverse the alias rewriting so a path the model sends back lands at pi's
 * actual on-disk location. Used by the tool-arg transformer when skill
 * aliasing is in effect for the session.
 */
export function rewriteSkillAliasPath(pathValue: unknown): unknown {
  if (typeof pathValue !== "string") return pathValue;
  if (pathValue.startsWith(SKILLS_ALIAS_GLOBAL)) {
    return pathValue.replace(SKILLS_ALIAS_GLOBAL, "~/.pi/agent/skills");
  }
  if (pathValue.startsWith(`./${SKILLS_ALIAS_PROJECT}`)) {
    return pathValue.replace(`./${SKILLS_ALIAS_PROJECT}`, PROJECT_SKILLS_ROOT);
  }
  if (pathValue.startsWith(SKILLS_ALIAS_PROJECT)) {
    return pathValue.replace(SKILLS_ALIAS_PROJECT, PROJECT_SKILLS_ROOT);
  }
  const projectAliasAbs = join(process.cwd(), SKILLS_ALIAS_PROJECT);
  if (pathValue.startsWith(projectAliasAbs)) {
    return pathValue.replace(projectAliasAbs, PROJECT_SKILLS_ROOT);
  }
  return pathValue;
}

/**
 * Resolve the platform-specific Claude Code native binary that ships as an
 * optional dep of @anthropic-ai/claude-agent-sdk. We bypass the SDK's own
 * resolver because of known bugs (#296, #6867).
 */
export function resolveClaudeCodeExecutable(): string {
  if (process.env.CLAUDE_CODE_EXECUTABLE) {
    return process.env.CLAUDE_CODE_EXECUTABLE;
  }
  const ext = process.platform === "win32" ? ".exe" : "";
  // Linux: try musl first (Alpine, Void, etc.), then glibc fallback.
  const candidates =
    process.platform === "linux"
      ? [
          `@anthropic-ai/claude-agent-sdk-linux-${process.arch}-musl/claude${ext}`,
          `@anthropic-ai/claude-agent-sdk-linux-${process.arch}/claude${ext}`,
        ]
      : [
          `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/claude${ext}`,
        ];
  const req = createRequire(
    import.meta.resolve("@anthropic-ai/claude-agent-sdk"),
  );
  for (const candidate of candidates) {
    try {
      return req.resolve(candidate);
    } catch {
      // try next candidate
    }
  }
  throw new Error(
    `Claude native binary not found for ${process.platform}-${process.arch}. ` +
      `Reinstall @anthropic-ai/claude-agent-sdk without --omit=optional, or set CLAUDE_CODE_EXECUTABLE.`,
  );
}
