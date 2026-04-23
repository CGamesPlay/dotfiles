/**
 * Pure rendering for subagent tool output.
 *
 * Produces plain-text line arrays from synthetic inputs so that rendering
 * can be unit-tested without a TUI. The `subagent.ts` tool wraps these
 * lines in TUI components and applies theme colors.
 */

import { formatElapsed } from "./elapsed.js";

export interface RenderUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  contextTokens?: number;
  turns?: number;
}

export type DisplayItem =
  | { type: "text"; text: string }
  | { type: "toolCall"; name: string; argsPreview: string };

export interface RenderTaskResult {
  agent: string;
  task: string;
  /** -1 = running, 0 = success, >0 = failure */
  exitCode: number;
  stopReason?: string;
  errorMessage?: string;
  usage: RenderUsage;
  /** ms epoch when this task started */
  startedAt?: number;
  /** ms epoch when this task ended (undefined while running) */
  endedAt?: number;
  /** Resolved preset name, if the agent uses a preset. */
  presetName?: string;
  provider?: string;
  model?: string;
  thinkingLevel?: string;
  /** Recent display items (text + tool calls) for the collapsed view. */
  displayItems: DisplayItem[];
  /** Final output text, if the task has produced an assistant text reply. */
  finalOutput?: string;
}

const COLLAPSED_TOOL_TAIL = 5;

function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  return `${(count / 1000000).toFixed(1)}M`;
}

/**
 * Format the per-task footer line.
 *
 * Always includes a zeroed token counter and the live clock so the line is
 * stable from the moment the task starts.
 */
export function formatTaskFooter(r: RenderTaskResult, now: number): string {
  const elapsedSeconds =
    r.startedAt !== undefined
      ? Math.floor(((r.endedAt ?? now) - r.startedAt) / 1000)
      : 0;

  const turns = r.usage.turns ?? 0;
  const parts: string[] = [];
  parts.push(`${turns} turn${turns === 1 ? "" : "s"}`);
  parts.push(`↑${formatTokens(r.usage.input)}`);
  parts.push(`↓${formatTokens(r.usage.output)}`);
  parts.push(`R${formatTokens(r.usage.cacheRead)}`);
  if (r.usage.cacheWrite > 0)
    parts.push(`W${formatTokens(r.usage.cacheWrite)}`);
  parts.push(`ctx:${formatTokens(r.usage.contextTokens ?? 0)}`);
  if (r.usage.cost > 0) parts.push(`$${r.usage.cost.toFixed(4)}`);
  parts.push(formatElapsed(elapsedSeconds));
  parts.push(formatModelDescriptor(r));
  return parts.join(" ");
}

/**
 * Reproduce the default footer's model descriptor:
 *   "(provider) modelId • thinking off"  or  "(provider) modelId • <level>"
 *
 * If a preset name is available, use it instead — that's what the user wants
 * to see when an agent is pinned to a preset.
 */
export function formatModelDescriptor(r: RenderTaskResult): string {
  if (r.presetName) return r.presetName;
  if (!r.model) return "(unknown model)";
  const head = r.provider ? `(${r.provider}) ${r.model}` : r.model;
  const level = r.thinkingLevel ?? "off";
  if (level === "off") return `${head} • thinking off`;
  return `${head} • ${level}`;
}

/**
 * Total footer for the parallel view.
 *
 * Wall-clock time = max(endedAt ?? now) - min(startedAt). Hidden if no task
 * has started yet.
 */
export function formatTotalFooter(
  results: RenderTaskResult[],
  now: number,
): string | undefined {
  const starts = results
    .map((r) => r.startedAt)
    .filter((v): v is number => v !== undefined);
  if (starts.length === 0) return undefined;
  const earliestStart = Math.min(...starts);
  const ends = results.map((r) => r.endedAt ?? now);
  const latestEnd = Math.max(...ends);
  const elapsedSeconds = Math.max(
    0,
    Math.floor((latestEnd - earliestStart) / 1000),
  );

  let turns = 0;
  let input = 0;
  let output = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let cost = 0;
  for (const r of results) {
    turns += r.usage.turns ?? 0;
    input += r.usage.input;
    output += r.usage.output;
    cacheRead += r.usage.cacheRead;
    cacheWrite += r.usage.cacheWrite;
    cost += r.usage.cost;
  }

  const parts: string[] = [];
  parts.push(`${turns} turn${turns === 1 ? "" : "s"}`);
  parts.push(`↑${formatTokens(input)}`);
  parts.push(`↓${formatTokens(output)}`);
  parts.push(`R${formatTokens(cacheRead)}`);
  if (cacheWrite > 0) parts.push(`W${formatTokens(cacheWrite)}`);
  if (cost > 0) parts.push(`$${cost.toFixed(4)}`);
  parts.push(formatElapsed(elapsedSeconds));
  return `Total: ${parts.join(" ")}`;
}

function statusGlyph(r: RenderTaskResult): string {
  if (r.exitCode === -1) return "⏳";
  if (r.exitCode === 0) return "✓";
  return "✗";
}

/**
 * For the collapsed view we only show recent tool calls. Assistant text
 * messages are rendered separately as `finalOutput` — including them here
 * would duplicate the final answer (the last assistant text always equals
 * `finalOutput`).
 */
function recentToolCalls(
  items: DisplayItem[],
): Array<Extract<DisplayItem, { type: "toolCall" }>> {
  const toolCalls = items.filter(
    (item): item is Extract<DisplayItem, { type: "toolCall" }> =>
      item.type === "toolCall",
  );
  if (toolCalls.length <= COLLAPSED_TOOL_TAIL) return toolCalls;
  return toolCalls.slice(-COLLAPSED_TOOL_TAIL);
}

function renderToolCall(
  item: Extract<DisplayItem, { type: "toolCall" }>,
): string {
  return `→ ${item.name} ${item.argsPreview}`.trimEnd();
}

/**
 * Lines for one task's section in the collapsed view.
 *
 *   ─── <agent> <icon>
 *   Task: ...
 *   <recent tool calls / text>
 *   <final output preview>
 *   <footer>
 */
export function renderTaskSection(r: RenderTaskResult, now: number): string[] {
  const lines: string[] = [];
  lines.push(`─── ${r.agent} ${statusGlyph(r)}`);
  lines.push(`Task: ${r.task}`);

  const tools = recentToolCalls(r.displayItems);
  for (const item of tools) lines.push(renderToolCall(item));

  if (r.finalOutput && r.finalOutput.trim()) {
    lines.push(r.finalOutput.trim());
  } else if (tools.length === 0) {
    lines.push("(no output)");
  }

  if (r.exitCode > 0 && r.errorMessage) {
    lines.push(`Error: ${r.errorMessage}`);
  }

  lines.push(formatTaskFooter(r, now));
  return lines;
}

/**
 * Top-level collapsed render for the whole subagent invocation.
 *
 * - Single task: header `subagent <agent>` (with hourglass while running)
 * - Multiple tasks: header `subagent parallel (N tasks)` plus per-task sections.
 *
 * Always emits a `Total:` line once at least one task has started.
 */
export function renderCollapsed(
  results: RenderTaskResult[],
  now: number,
): string[] {
  const lines: string[] = [];
  if (results.length === 0) {
    lines.push("subagent (no tasks)");
    return lines;
  }

  const anyRunning = results.some((r) => r.exitCode === -1);

  if (results.length === 1) {
    const r = results[0];
    const headerIcon = anyRunning ? "⏳ " : "";
    lines.push(`${headerIcon}subagent ${r.agent}`);
    lines.push("");
    lines.push(`Task: ${r.task}`);
    const tools = recentToolCalls(r.displayItems);
    for (const item of tools) lines.push(renderToolCall(item));
    if (r.finalOutput && r.finalOutput.trim()) {
      lines.push(r.finalOutput.trim());
    } else if (tools.length === 0) {
      lines.push("(no output)");
    }
    if (r.exitCode > 0 && r.errorMessage) {
      lines.push(`Error: ${r.errorMessage}`);
    }
    lines.push(formatTaskFooter(r, now));

    const total = formatTotalFooter(results, now);
    if (total) {
      lines.push("");
      lines.push(total);
    }
    return lines;
  }

  const headerIcon = anyRunning ? "⏳" : "✓";
  lines.push(`${headerIcon} subagent parallel (${results.length} tasks)`);
  for (const r of results) {
    lines.push("");
    for (const sectionLine of renderTaskSection(r, now)) {
      lines.push(sectionLine);
    }
  }

  const total = formatTotalFooter(results, now);
  if (total) {
    lines.push("");
    lines.push(total);
  }
  return lines;
}
