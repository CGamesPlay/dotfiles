/**
 * Agent Discovery — User-only agents
 *
 * Loads agent definitions from ~/.pi/agent/agents/ (user agents only).
 *
 * Preset resolution is **not** done here. Each agent stores the raw `preset`
 * frontmatter value (bare like "small" or qualified like "claude/small"). The
 * subagent tool resolves it at invocation time against the main session's
 * current group, so a bare preset follows whatever provider the session is on.
 *
 * Discovery performs structural validation only and warns about presets that
 * can never resolve (missing field, unknown qualified group/preset, or a bare
 * name that exists in no group at all).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { getAllRefs } from "./presets.js";

export interface AgentConfig {
  name: string;
  description: string;
  tools?: string[];
  /** Raw preset value from frontmatter (bare or qualified). */
  presetName?: string;
  systemPrompt: string;
  source: "user";
  filePath: string;
}

export interface AgentWarning {
  agentName: string;
  filePath: string;
  reason: string;
}

/**
 * Load agents from a directory. Each .md file is parsed for:
 * - frontmatter: name, description, tools (comma-separated), preset
 * - body: systemPrompt
 */
function loadAgentsFromDir(dir: string): AgentConfig[] {
  const agents: AgentConfig[] = [];

  if (!fs.existsSync(dir)) {
    return agents;
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return agents;
  }

  for (const entry of entries) {
    if (!entry.name.endsWith(".md")) continue;
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;

    const filePath = path.join(dir, entry.name);
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const { frontmatter, body } =
      parseFrontmatter<Record<string, string>>(content);

    if (!frontmatter.name || !frontmatter.description) {
      continue;
    }

    const tools = frontmatter.tools
      ?.split(",")
      .map((t: string) => t.trim())
      .filter(Boolean);

    agents.push({
      name: frontmatter.name,
      description: frontmatter.description,
      tools: tools && tools.length > 0 ? tools : undefined,
      presetName: frontmatter.preset,
      systemPrompt: body,
      source: "user",
      filePath,
    });
  }

  return agents;
}

/**
 * Structurally validate a raw preset ref against the known references.
 *
 * - Qualified `group/model` (2 tokens, group first): valid iff it appears
 *   verbatim in refs.
 * - Bare `model` (1 token): valid iff some ref ends with `/<token>.`... iff
 *   some ref is `<group>/<token>` for some group.
 * - Anything else (0 or 3+ tokens): invalid.
 *
 * Returns undefined when valid, or a human-readable reason when not.
 */
function validateRawPreset(raw: string, refs: string[]): string | undefined {
  const parts = raw.split("/");
  if (parts.length === 2) {
    return refs.includes(raw) ? undefined : `Unknown preset "${raw}"`;
  }
  if (parts.length === 1) {
    const suffix = `/${raw}`;
    return refs.some((r) => r.endsWith(suffix))
      ? undefined
      : `Unknown preset "${raw}"`;
  }
  return `Invalid preset "${raw}" (use "group/model", e.g. "claude/small")`;
}

export interface AgentDiscoveryResult {
  agents: AgentConfig[];
  warnings: AgentWarning[];
}

/**
 * Discover user agents from ~/.pi/agent/agents/.
 * Validates preset references and warns about agents whose preset can never
 * resolve. Preset resolution itself happens lazily at invocation.
 */
export async function discoverAgents(): Promise<AgentDiscoveryResult> {
  const agentDir = path.join(os.homedir(), ".pi", "agent", "agents");

  const rawAgents = loadAgentsFromDir(agentDir);
  const refs = await getAllRefs();

  const resolved: AgentConfig[] = [];
  const warnings: AgentWarning[] = [];
  for (const agent of rawAgents) {
    if (!agent.presetName) {
      warnings.push({
        agentName: agent.name,
        filePath: agent.filePath,
        reason: 'Missing "preset" field in frontmatter',
      });
      continue;
    }

    const reason = validateRawPreset(agent.presetName, refs);
    if (reason) {
      warnings.push({
        agentName: agent.name,
        filePath: agent.filePath,
        reason,
      });
      continue;
    }

    resolved.push(agent);
  }

  return { agents: resolved, warnings };
}
