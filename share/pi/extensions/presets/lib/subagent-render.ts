/**
 * Pure rendering for subagent tool output.
 *
 * Produces a markdown string from synthetic inputs so that rendering can be
 * unit-tested without a TUI. The `subagent.ts` tool wraps the result in a
 * `Markdown` component for display.
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
  | { type: "toolCall"; name: string; argsPreview: string }
  | { type: "toolResult"; toolCallId?: string; isError: boolean; text: string };

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
  /** Tool calls, tool results, and assistant text for this task. */
  displayItems: DisplayItem[];
  /** Final output text, if the task has produced an assistant text reply. */
  finalOutput?: string;
}

/** Controls how much content to show in collapsed vs expanded views. */
export interface RenderConfig {
  /** Max lines of task description shown. null = all. */
  taskLines: number | null;
  /** Max display items shown (from the end after filtering). null = all. */
  displayItems: number | null;
  /** Max lines of final output shown. null = all. */
  finalOutputLines: number | null;
}

export const COLLAPSED: RenderConfig = {
  taskLines: 1,
  displayItems: 3,
  finalOutputLines: 4,
};

export const EXPANDED: RenderConfig = {
  taskLines: null,
  displayItems: null,
  finalOutputLines: null,
};

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
  parts.push(statusGlyph(r));
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

export function statusGlyph(r: RenderTaskResult): string {
  if (r.exitCode === -1) return "⏳";
  if (r.exitCode === 0) return "✓";
  return "✗";
}

/**
 * Filter display items per the display rules:
 * - text items are excluded (finalOutput handles text)
 * - successful tool results are always hidden
 * - failed tool results are shown only for the most recent tool call
 */
export function filterDisplayItems(items: DisplayItem[]): DisplayItem[] {
  // Find the index of the last toolCall to identify whose result to show.
  let lastToolCallIdx = -1;
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].type === "toolCall") {
      lastToolCallIdx = i;
      break;
    }
  }

  return items.filter((item, idx) => {
    if (item.type === "text") return false;
    if (item.type === "toolResult") {
      if (!item.isError) return false;
      if (lastToolCallIdx === -1) return false;
      return idx === lastToolCallIdx + 1;
    }
    return true; // toolCall: always kept (trimmed by displayItems limit)
  });
}
