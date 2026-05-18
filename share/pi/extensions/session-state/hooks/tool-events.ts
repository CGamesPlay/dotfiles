/**
 * Tool Call/Result Interception
 *
 * Handles tool_call and tool_result events for session storage tracking.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { statSync, readFileSync } from "node:fs";
import path from "node:path";
import { isSessionStoragePath } from "../lib/session-storage.js";
import { syncTodoStateFromStorage, refreshTodoWidget } from "../tools/todo.js";
import type { AppState } from "../state.js";

// ─── Exported Handlers ─────────────────────────────────────────────────────────

export async function onToolCall(state: AppState, event: any, ctx: any) {
  // Session storage: track internal writes to suppress external-mod detection
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
}

export async function onToolResult(
  state: AppState,
  event: any,
  _ctx: ExtensionContext,
) {
  // Session storage: update tracked files after internal write/edit
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
}
