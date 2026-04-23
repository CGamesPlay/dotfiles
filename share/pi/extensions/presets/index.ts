/**
 * Presets Extension — Entry Point
 *
 * Wires the preset and subagent features.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createAppState } from "./state.js";
import { registerPresetFeatures } from "./tools/preset.js";
import {
  registerSubagentTool,
  loadSubagentCache,
  getCachedAgents,
} from "./tools/subagent.js";

const PROJECT_CONTEXT_HEADING = "# Project Context";

function buildSubagentBlock(
  agents: ReadonlyArray<{ name: string; description: string }>,
): string {
  const lines = agents.map((a) => `- ${a.name} - ${a.description}`);
  return `Subagents:\n${lines.join("\n")}`;
}

function injectSubagentBlock(systemPrompt: string, block: string): string {
  const idx = systemPrompt.indexOf(PROJECT_CONTEXT_HEADING);
  if (idx === -1) {
    const sep = systemPrompt.endsWith("\n") ? "\n" : "\n\n";
    return `${systemPrompt}${sep}${block}\n`;
  }
  return `${systemPrompt.slice(0, idx)}${block}\n\n${systemPrompt.slice(idx)}`;
}

export default function (pi: ExtensionAPI) {
  const state = createAppState();

  pi.on("resources_discover", async (_event, ctx) => {
    const warnings = await loadSubagentCache();
    if (warnings.length > 0) {
      const lines = warnings
        .map((w) => `${w.agentName}: ${w.reason}`)
        .join("; ");
      ctx.ui.notify(
        `subagent: ${warnings.length} agent(s) skipped — ${lines}`,
        "warning",
      );
    }
  });

  pi.on("before_agent_start", (event) => {
    const agents = getCachedAgents();
    if (agents.length === 0) return;
    const block = buildSubagentBlock(agents);
    return { systemPrompt: injectSubagentBlock(event.systemPrompt, block) };
  });

  registerSubagentTool(pi);
  registerPresetFeatures(state, pi);
}
