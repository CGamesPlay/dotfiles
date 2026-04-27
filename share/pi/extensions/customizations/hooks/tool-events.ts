/**
 * Tool Call/Result Interception
 *
 * Handles tool_call and tool_result events for session storage tracking
 * and bash-tee pipeline injection.
 */

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
  isToolCallEventType,
  isBashToolResult,
} from "@mariozechner/pi-coding-agent";
import { statSync, readFileSync } from "node:fs";
import path from "node:path";
import { injectTee, formatSize } from "../lib/bash-pipeline.js";
import { isSessionStoragePath } from "../lib/session-storage.js";
import { syncTodoStateFromStorage, refreshTodoWidget } from "../tools/todo.js";
import type { AppState } from "../state.js";

// ─── Exported Handlers ─────────────────────────────────────────────────────────

export async function onToolCall(state: AppState, event: any, ctx: any) {
  // 1. Session storage: track internal writes to suppress external-mod detection
  if (
    (event.toolName === "write" || event.toolName === "edit") &&
    state.sessionStorage.dir
  ) {
    const toolPath = event.input?.path as string | undefined;
    if (toolPath) {
      const absolutePath = path.isAbsolute(toolPath)
        ? path.resolve(toolPath)
        : path.resolve(ctx.cwd, toolPath);
      if (isSessionStoragePath(absolutePath, state.sessionStorage.dir)) {
        state.sessionStorage.pendingInternalWrites.add(absolutePath);
      }
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

export async function onToolResult(
  state: AppState,
  event: any,
  _ctx: ExtensionContext,
) {
  // 1. Session storage: update tracked files after internal write/edit
  if (
    (event.toolName === "write" || event.toolName === "edit") &&
    state.sessionStorage.dir
  ) {
    const toolPath = event.input?.path as string | undefined;
    if (toolPath) {
      const absolutePath = path.isAbsolute(toolPath)
        ? path.resolve(toolPath)
        : path.resolve(_ctx.cwd, toolPath);
      if (state.sessionStorage.pendingInternalWrites.has(absolutePath)) {
        state.sessionStorage.pendingInternalWrites.delete(absolutePath);
        if (!event.isError) {
          // Update tracked state so detection doesn't flag this as external
          try {
            const s = statSync(absolutePath);
            const content = readFileSync(absolutePath, "utf-8");
            state.sessionStorage.trackedFiles.set(absolutePath, {
              content,
              ino: s.ino,
              mtimeMs: s.mtimeMs,
            });
          } catch {
            // File may not exist if the tool errored
          }

          // If this was TODO.md, sync state and warn on parse errors immediately
          if (path.basename(absolutePath) === "TODO.md") {
            syncTodoStateFromStorage(state);
            refreshTodoWidget(state, _ctx);
            if (
              state.todo.items === null &&
              state.todo.lastRawContent !== null &&
              !state.todo.parseErrorNotified
            ) {
              state.todo.parseErrorNotified = true;
              return {
                content: [
                  ...event.content,
                  {
                    type: "text" as const,
                    text: "\n\nWarning: TODO.md could not be parsed. Each line must match `- [ ] text` or `- [x] text`. Please fix the format.",
                  },
                ],
              };
            }
          }
        }
      }
    }
  }

  // 2. Bash-tee recovery log annotation
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
