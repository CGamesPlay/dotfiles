/**
 * Custom footer component for the tui extension.
 *
 * Replaces pi's built-in footer with a 3-line powerline-style layout:
 *   Line 1: session name (left) / pwd+branch (right)
 *   Line 2: top row widgets (left A/B/C columns + right C/B/A columns)
 *   Line 3: bottom row widgets (same structure)
 */

import type {
  ExtensionAPI,
  ExtensionContext,
  ReadonlyFooterDataProvider,
} from "@earendil-works/pi-coding-agent";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { TUI, Component } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

// ─── Layout Template ──────────────────────────────────────────────────────────

// Each row is [colA_widgets, colB_widgets, colC_widgets].
// Widgets are IDs: 'tokens' | 'cost' | 'context' | 'model' | 'thinking'
//   | `status:${key}` | 'status_rest'
export const FOOTER_LAYOUT = {
  top_left: [["context"], ["tokens"], []],
  top_right: [[], ["cost"], ["model", "thinking"]],
  bottom_left: [["status:clock"], ["status:10-changes"], ["status_rest"]],
  bottom_right: [[], [], []],
} as const satisfies Record<string, readonly (readonly string[])[]>;

// ─── Column Colors ────────────────────────────────────────────────────────────

const COL_A_BG = "customMessageBg" as const;
const COL_B_BG = "selectedBg" as const;

// Powerline separator characters (require a Nerd Font / Powerline font)
// Top row uses \ slant (e0b8 right, e0be left); bottom row uses / slant (e0ba right, e0bc left)
const SEP_LEFT_TOP = "\ue0b8";
const SEP_RIGHT_TOP = "\ue0ba";
const SEP_LEFT_BOT = "\ue0bc";
const SEP_RIGHT_BOT = "\ue0be";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bgAnsiToFgAnsi(bgAnsi: string): string {
  return bgAnsi.replace("\x1b[48;", "\x1b[38;");
}

function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${Math.round(count / 1000000)}M`;
}

// ─── Widget Rendering ─────────────────────────────────────────────────────────

function renderWidget(
  id: string,
  ctx: ExtensionContext,
  footerData: ReadonlyFooterDataProvider,
  explicitStatusKeys: Set<string>,
  theme: Theme,
  pi: ExtensionAPI | undefined,
): string {
  if (id === "tokens") {
    let total = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "message" && entry.message.role === "assistant") {
        total.input += entry.message.usage.input;
        total.output += entry.message.usage.output;
        total.cacheRead += entry.message.usage.cacheRead;
        total.cacheWrite += entry.message.usage.cacheWrite;
      }
    }
    const parts: string[] = [];
    parts.push(`↑${formatTokens(total.input)}`);
    parts.push(`↓${formatTokens(total.output)}`);
    if (total.cacheRead) parts.push(`R${formatTokens(total.cacheRead)}`);
    if (total.cacheWrite) parts.push(`W${formatTokens(total.cacheWrite)}`);
    return parts.join(" ");
  }

  if (id === "cost") {
    let totalCost = 0;
    let usingSubscription = false;
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "message" && entry.message.role === "assistant") {
        totalCost += entry.message.usage.cost.total;
      }
    }
    if (ctx.model) {
      usingSubscription = ctx.modelRegistry.isUsingOAuth(ctx.model);
    }
    if (!totalCost && !usingSubscription) return "";
    return `$${totalCost.toFixed(3)}${usingSubscription ? " (sub)" : ""}`;
  }

  if (id === "context") {
    const usage = ctx.getContextUsage();
    const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
    const percent = usage?.percent;
    const display =
      percent !== null && percent !== undefined
        ? `${percent.toFixed(1)}%/${formatTokens(contextWindow)}`
        : `?/${formatTokens(contextWindow)}`;
    if (!contextWindow) return "";
    const percentValue = percent ?? 0;
    if (percentValue > 90) return theme.fg("error", display);
    if (percentValue > 70) return theme.fg("warning", display);
    return display;
  }

  if (id === "model") {
    const model = ctx.model;
    if (!model) return "";
    return `${model.provider}/${model.id}`;
  }

  if (id === "thinking") {
    const model = ctx.model;
    if (!model?.reasoning) return "";
    const level = pi?.getThinkingLevel() ?? "off";
    return level === "off" ? "think: no" : level;
  }

  if (id.startsWith("status:")) {
    const key = id.slice("status:".length);
    return footerData.getExtensionStatuses().get(key) ?? "";
  }

  if (id === "status_rest") {
    const statuses = footerData.getExtensionStatuses();
    const parts: string[] = [];
    for (const [key, text] of [...statuses.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      if (!explicitStatusKeys.has(key)) {
        parts.push(text);
      }
    }
    return parts.join("  ");
  }

  return "";
}

// ─── Column Assembly ──────────────────────────────────────────────────────────

function renderColumn(
  widgetIds: readonly string[],
  ctx: ExtensionContext,
  footerData: ReadonlyFooterDataProvider,
  explicitStatusKeys: Set<string>,
  theme: Theme,
  pi: ExtensionAPI | undefined,
): string {
  const parts = widgetIds
    .map((id) => renderWidget(id, ctx, footerData, explicitStatusKeys, theme, pi))
    .filter((s) => s !== "");
  return parts.join("  ");
}

// ─── Side Rendering ───────────────────────────────────────────────────────────

function renderLeftSide(
  cols: readonly (readonly string[])[],
  ctx: ExtensionContext,
  footerData: ReadonlyFooterDataProvider,
  explicitStatusKeys: Set<string>,
  theme: Theme,
  sepRight: string,
  pi: ExtensionAPI | undefined,
): string {
  const [colA, colB, colC] = [
    renderColumn(cols[0], ctx, footerData, explicitStatusKeys, theme, pi),
    renderColumn(cols[1], ctx, footerData, explicitStatusKeys, theme, pi),
    renderColumn(cols[2], ctx, footerData, explicitStatusKeys, theme, pi),
  ];

  const aBgAnsi = theme.getBgAnsi(COL_A_BG);
  const bBgAnsi = theme.getBgAnsi(COL_B_BG);
  const aAsFgAnsi = bgAnsiToFgAnsi(aBgAnsi);
  const bAsFgAnsi = bgAnsiToFgAnsi(bBgAnsi);

  let result = "";

  if (colA !== "") {
    result += aBgAnsi + " " + colA + " ";
    const nextBg = colB !== "" ? bBgAnsi : "\x1b[49m";
    result += nextBg + aAsFgAnsi + sepRight + "\x1b[39m";
  }

  if (colB !== "") {
    result += bBgAnsi + " " + colB + " ";
    result += "\x1b[49m" + bAsFgAnsi + sepRight + "\x1b[39m";
  }

  if (colC !== "") {
    result += " " + colC;
  }

  return result;
}

function renderRightSide(
  cols: readonly (readonly string[])[],
  ctx: ExtensionContext,
  footerData: ReadonlyFooterDataProvider,
  explicitStatusKeys: Set<string>,
  theme: Theme,
  sepLeft: string,
  pi: ExtensionAPI | undefined,
): string {
  // Right-side cols order: [C_widgets, B_widgets, A_widgets] — A is outermost (far right)
  const colC = renderColumn(
    cols[0],
    ctx,
    footerData,
    explicitStatusKeys,
    theme,
    pi,
  );
  const colB = renderColumn(
    cols[1],
    ctx,
    footerData,
    explicitStatusKeys,
    theme,
    pi,
  );
  const colA = renderColumn(
    cols[2],
    ctx,
    footerData,
    explicitStatusKeys,
    theme,
    pi,
  );

  const aBgAnsi = theme.getBgAnsi(COL_A_BG);
  const bBgAnsi = theme.getBgAnsi(COL_B_BG);
  const aAsFgAnsi = bgAnsiToFgAnsi(aBgAnsi);
  const bAsFgAnsi = bgAnsiToFgAnsi(bBgAnsi);

  let result = "";

  if (colC !== "") {
    result += colC;
  }

  if (colB !== "") {
    // C→B triangle: fg=B's bg as fg, bg=transparent
    result += bAsFgAnsi + sepLeft + "\x1b[39m";
    result += bBgAnsi + " " + colB + " ";
    if (colA !== "") {
      // B→A triangle: fg=A's bg as fg, bg=B (already set)
      result += aAsFgAnsi + sepLeft + "\x1b[39m";
    } else {
      result += "\x1b[49m"; // reset bg after B
    }
  } else if (colA !== "") {
    // C→A triangle (B is empty): fg=A's bg as fg, bg=transparent
    result += aAsFgAnsi + sepLeft + "\x1b[39m";
  }

  if (colA !== "") {
    result += aBgAnsi + " " + colA + " \x1b[49m";
  }

  return result;
}

// ─── Row & Header Rendering ───────────────────────────────────────────────────

function getExplicitStatusKeys(layout: typeof FOOTER_LAYOUT): Set<string> {
  const keys = new Set<string>();
  for (const cols of Object.values(layout)) {
    for (const widgets of cols) {
      for (const id of widgets) {
        if (id.startsWith("status:")) {
          keys.add(id.slice("status:".length));
        }
      }
    }
  }
  return keys;
}

function renderRow(
  leftCols: readonly (readonly string[])[],
  rightCols: readonly (readonly string[])[],
  width: number,
  ctx: ExtensionContext,
  footerData: ReadonlyFooterDataProvider,
  theme: Theme,
  explicitStatusKeys: Set<string>,
  sepLeft: string,
  sepRight: string,
  pi: ExtensionAPI | undefined,
): string {
  const left = renderLeftSide(
    leftCols,
    ctx,
    footerData,
    explicitStatusKeys,
    theme,
    sepLeft,
    pi,
  );
  const right = renderRightSide(
    rightCols,
    ctx,
    footerData,
    explicitStatusKeys,
    theme,
    sepRight,
    pi,
  );

  const leftWidth = visibleWidth(left);
  const rightWidth = visibleWidth(right);
  const totalNeeded = leftWidth + rightWidth;

  if (totalNeeded >= width) {
    return truncateToWidth(left + right, width, theme.fg("dim", "..."));
  }

  const padding = " ".repeat(width - leftWidth - rightWidth);
  return left + padding + right;
}

function renderHeaderLine(
  width: number,
  ctx: ExtensionContext,
  footerData: ReadonlyFooterDataProvider,
  theme: Theme,
): string {
  const sessionName = ctx.sessionManager.getSessionName() ?? "";

  let pwd = ctx.sessionManager.getCwd();
  const home = process.env.HOME || process.env.USERPROFILE;
  if (home && pwd.startsWith(home)) {
    pwd = `~${pwd.slice(home.length)}`;
  }
  const branch = footerData.getGitBranch();
  if (branch) {
    pwd = `${pwd} (${branch})`;
  }

  const leftText = theme.fg("dim", sessionName);
  const rightText = theme.fg("dim", pwd);

  const leftWidth = visibleWidth(leftText);
  const rightWidth = visibleWidth(rightText);
  const totalNeeded = leftWidth + rightWidth;

  if (totalNeeded >= width) {
    return truncateToWidth(leftText + rightText, width, theme.fg("dim", "..."));
  }

  const padding = " ".repeat(width - leftWidth - rightWidth);
  return leftText + padding + rightText;
}

// ─── Footer Factory ───────────────────────────────────────────────────────────

export type ExtensionState = {
  ctx: ExtensionContext | undefined;
  pi: ExtensionAPI | undefined;
};

export function createFooterFactory(
  state: ExtensionState,
): (
  tui: TUI,
  theme: Theme,
  footerData: ReadonlyFooterDataProvider,
) => Component {
  return (_tui, theme, footerData) => ({
    invalidate() {},
    render(width: number): string[] {
      const ctx = state.ctx;
      if (!ctx) return [];

      const explicitStatusKeys = getExplicitStatusKeys(FOOTER_LAYOUT);

      const headerLine = renderHeaderLine(width, ctx, footerData, theme);
      const topRow = renderRow(
        FOOTER_LAYOUT.top_left,
        FOOTER_LAYOUT.top_right,
        width,
        ctx,
        footerData,
        theme,
        explicitStatusKeys,
        SEP_LEFT_TOP,
        SEP_RIGHT_TOP,
        state.pi,
      );
      const bottomRow = renderRow(
        FOOTER_LAYOUT.bottom_left,
        FOOTER_LAYOUT.bottom_right,
        width,
        ctx,
        footerData,
        theme,
        explicitStatusKeys,
        SEP_LEFT_BOT,
        SEP_RIGHT_BOT,
        state.pi,
      );

      return [headerLine, topRow, bottomRow];
    },
  });
}
