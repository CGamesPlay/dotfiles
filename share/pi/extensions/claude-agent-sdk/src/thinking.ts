import type { EffortLevel } from "@anthropic-ai/claude-agent-sdk";
import type { SimpleStreamOptions } from "@earendil-works/pi-ai";

type ThinkingLevel = NonNullable<SimpleStreamOptions["reasoning"]>;
type NonXhighThinkingLevel = Exclude<ThinkingLevel, "xhigh">;

const DEFAULT_THINKING_BUDGETS: Record<NonXhighThinkingLevel, number> = {
  minimal: 2048,
  low: 8192,
  medium: 16384,
  high: 31999,
};

// "xhigh" is unavailable in the TUI because pi-ai's supportsXhigh() doesn't
// recognize the "claude-agent-sdk" api type. As a workaround, opus-4-6 gets
// shifted budgets so "high" uses the budget that xhigh would normally use.
const OPUS_46_THINKING_BUDGETS: Record<ThinkingLevel, number> = {
  minimal: 2048,
  low: 8192,
  medium: 31999,
  high: 63999,
  xhigh: 63999,
};

export function mapThinkingTokens(
  reasoning?: ThinkingLevel,
  modelId?: string,
  thinkingBudgets?: SimpleStreamOptions["thinkingBudgets"],
): number | undefined {
  if (!reasoning) return undefined;

  const isOpus46 =
    modelId?.includes("opus-4-6") || modelId?.includes("opus-4.6");
  if (isOpus46) {
    return OPUS_46_THINKING_BUDGETS[reasoning];
  }

  const effective: NonXhighThinkingLevel =
    reasoning === "xhigh" ? "high" : reasoning;
  const customBudgets = thinkingBudgets as
    | Partial<Record<NonXhighThinkingLevel, number>>
    | undefined;
  const customBudget = customBudgets?.[effective];
  if (
    typeof customBudget === "number" &&
    Number.isFinite(customBudget) &&
    customBudget > 0
  ) {
    return customBudget;
  }
  return DEFAULT_THINKING_BUDGETS[effective];
}

export function supportsAdaptiveThinking(modelId: string): boolean {
  return (
    modelId.includes("opus-4-6") ||
    modelId.includes("opus-4.6") ||
    modelId.includes("opus-4-7") ||
    modelId.includes("opus-4.7") ||
    modelId.includes("sonnet-4-6") ||
    modelId.includes("sonnet-4.6")
  );
}

// Shifted up one level to preserve the effective budget users had with
// maxThinkingTokens before adaptive thinking. xhigh lands at the SDK's
// `max` cap.
export const PI_LEVEL_TO_EFFORT: Record<ThinkingLevel, EffortLevel> = {
  minimal: "low",
  low: "medium",
  medium: "high",
  high: "xhigh",
  xhigh: "max",
};
