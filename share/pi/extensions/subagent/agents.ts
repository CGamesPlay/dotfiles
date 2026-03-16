/**
 * Agent discovery and configuration.
 *
 * Agents are Markdown files with YAML frontmatter that define name, description,
 * optional model/tools, and a system prompt body.
 *
 * Lookup location:
 *   - Plugin-local agents: agents/*.md  (sibling directory next to this file)
 */

import { parseFrontmatter } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export interface AgentConfig {
	name: string;
	description: string;
	tools?: string[];
	model?: string;
	thinking?: string;
	systemPrompt: string;
	filePath: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Absolute path to the agents/ directory co-located with this plugin file. */
const PLUGIN_AGENTS_DIR = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	"agents",
);

/** Parse a single agent markdown file into an AgentConfig. Returns null on skip. */
function parseAgentFile(filePath: string): AgentConfig | null {
	let content: string;
	try { content = fs.readFileSync(filePath, "utf-8"); } catch { return null; }

	let parsed: { frontmatter: Record<string, unknown>; body: string };
	try {
		parsed = parseFrontmatter<Record<string, unknown>>(content);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.warn(`[pi-subagent] Skipping invalid agent file "${filePath}": ${message}`);
		return null;
	}

	const frontmatter = parsed.frontmatter ?? {};
	const body = parsed.body ?? "";

	const name = typeof frontmatter.name === "string" ? frontmatter.name.trim() : "";
	const description = typeof frontmatter.description === "string" ? frontmatter.description.trim() : "";
	if (!name || !description) return null;

	let tools: string[] | undefined;
	if (typeof frontmatter.tools === "string") {
		const parsedTools = frontmatter.tools
			.split(",")
			.map((t) => t.trim())
			.filter(Boolean);
		if (parsedTools.length > 0) tools = parsedTools;
	} else if (Array.isArray(frontmatter.tools)) {
		const parsedTools = frontmatter.tools
			.filter((t): t is string => typeof t === "string")
			.map((t) => t.trim())
			.filter(Boolean);
		if (parsedTools.length > 0) tools = parsedTools;
	} else if (frontmatter.tools !== undefined) {
		console.warn(
			`[pi-subagent] Ignoring invalid tools field in "${filePath}". Expected a comma-separated string or string array.`,
		);
	}

	return {
		name,
		description,
		tools,
		model: typeof frontmatter.model === "string" ? frontmatter.model : undefined,
		thinking: typeof frontmatter.thinking === "string" ? frontmatter.thinking : undefined,
		systemPrompt: body,
		filePath,
	};
}

/** Load all agent definitions from the plugin-local agents/ directory. */
function loadAgents(): AgentConfig[] {
	if (!fs.existsSync(PLUGIN_AGENTS_DIR)) return [];

	let entries: fs.Dirent[];
	try { entries = fs.readdirSync(PLUGIN_AGENTS_DIR, { withFileTypes: true }); } catch { return []; }

	const agents: AgentConfig[] = [];
	for (const entry of entries) {
		if (!entry.name.endsWith(".md")) continue;
		if (!entry.isFile() && !entry.isSymbolicLink()) continue;

		const agent = parseAgentFile(path.join(PLUGIN_AGENTS_DIR, entry.name));
		if (agent) agents.push(agent);
	}
	return agents;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Discover all available agents from the agents/ directory co-located with the plugin source. */
export function discoverAgents(): AgentConfig[] {
	return loadAgents();
}
