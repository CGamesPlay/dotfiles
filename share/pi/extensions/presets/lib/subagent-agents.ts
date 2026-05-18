/**
 * Agent Discovery — User-only agents with preset resolution
 *
 * Loads agent definitions from ~/.pi/agent/agents/ (user agents only).
 * Resolves preset names to model/thinkingLevel via presets.json.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { resolvePreset } from "./presets.js";

export interface AgentConfig {
  name: string;
  description: string;
  tools?: string[];
  presetName?: string; // preset name from frontmatter (if resolved)
  provider?: string; // resolved from preset
  model?: string; // resolved from preset
  thinkingLevel?: string; // resolved from preset
  systemPrompt: string;
  source: "user";
  filePath: string;
}

export interface AgentWarning {
  agentName: string;
  filePath: string;
  reason: string;
}

interface RawAgent extends AgentConfig {
  presetName?: string;
}

/**
 * Load agents from a directory. Each .md file is parsed for:
 * - frontmatter: name, description, tools (comma-separated), preset
 * - body: systemPrompt
 */
function loadAgentsFromDir(dir: string): RawAgent[] {
  const agents: RawAgent[] = [];

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
      model: undefined,
      thinkingLevel: undefined,
      presetName: frontmatter.preset,
      systemPrompt: body,
      source: "user",
      filePath,
    });
  }

  return agents;
}

/**
 * Discover user agents from ~/.pi/agent/agents/.
 * Resolves preset names and filters out agents with unresolvable presets.
 */
export interface AgentDiscoveryResult {
  agents: AgentConfig[];
  warnings: AgentWarning[];
}

export async function discoverAgents(): Promise<AgentDiscoveryResult> {
  const agentDir = path.join(os.homedir(), ".pi", "agent", "agents");

  // Load raw agents (single pass — no re-reading files)
  const rawAgents = loadAgentsFromDir(agentDir);

  // Resolve presets
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

    const preset = await resolvePreset(agent.presetName);
    if (!preset) {
      warnings.push({
        agentName: agent.name,
        filePath: agent.filePath,
        reason: `Unknown preset "${agent.presetName}"`,
      });
      continue;
    }

    resolved.push({
      name: agent.name,
      description: agent.description,
      tools: agent.tools,
      presetName: agent.presetName,
      provider: preset.provider,
      model: preset.model,
      thinkingLevel: preset.thinkingLevel,
      systemPrompt: agent.systemPrompt,
      source: "user",
      filePath: agent.filePath,
    });
  }

  return { agents: resolved, warnings };
}
