/**
 * Tool Call/Result Interception
 *
 * Handles tool_call, tool_result, and user_bash events.
 * Coordinates system-assistant permission gating and bash-tee pipeline injection.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  isToolCallEventType,
  isBashToolResult,
} from "@mariozechner/pi-coding-agent";
import { statSync } from "node:fs";
import { injectTee, formatSize } from "../lib/bash-pipeline.js";
import { getGateSummary, overrideUserBash } from "../tools/system-assistant.js";
import type { AppState } from "../state.js";

const GATED_TOOLS = new Set(["bash", "read", "write", "edit"]);

// ─── Exported Handlers ─────────────────────────────────────────────────────────

export async function onToolCall(
  state: AppState,
  pi: ExtensionAPI,
  event: any,
  ctx: any,
) {
  // 1. System-assistant permission gating (runs first so rejected tools don't get tee-injected)
  const isActive = () => !!pi.getFlag("system-assistant");
  if (isActive() && GATED_TOOLS.has(event.toolName)) {
    if (!ctx.hasUI) {
      return {
        block: true,
        reason:
          "System assistant mode requires interactive approval (no UI available)",
      };
    }

    const summary = getGateSummary(event);
    const approved = await ctx.ui.confirm("🔒 Approve?", summary);

    if (!approved) {
      return { block: true, reason: "Blocked by user" };
    }
  }

  // 2. Bash-tee pipeline injection
  if (!isToolCallEventType("bash", event)) return;

  const result = injectTee(event.input.command);
  if (!result) return;

  state.bashTee.activeTees.set(event.toolCallId, {
    teePath: result.teePath,
    originalCommand: event.input.command,
  });
  event.input.command = result.modified;
}

export async function onToolResult(state: AppState, event: any, _ctx: any) {
  // Bash-tee recovery log annotation
  if (!isBashToolResult(event)) return;

  const info = state.bashTee.activeTees.get(event.toolCallId);
  if (!info) return;
  state.bashTee.activeTees.delete(event.toolCallId);

  try {
    const stat = statSync(info.teePath);

    // Compare tee file size against the tool result text size.
    // If the pipeline filter didn't actually remove anything, suppress the message.
    const resultText = event.content
      .filter((c: { type: string }) => c.type === "text")
      .map((c: { type: string; text?: string }) => c.text ?? "")
      .join("");
    const resultBytes = Buffer.byteLength(resultText, "utf-8");
    if (stat.size <= resultBytes) return;

    const size = formatSize(stat.size);
    return {
      content: [
        ...event.content,
        {
          type: "text" as const,
          text: `\n[Full unfiltered output saved to ${info.teePath} (${size})]`,
        },
      ],
    };
  } catch {
    return; // File doesn't exist
  }
}

export async function onUserBash(pi: ExtensionAPI, _event: any, _ctx: any) {
  // System-assistant $SHELL override
  return overrideUserBash(pi);
}
