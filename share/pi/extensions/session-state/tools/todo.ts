/**
 * Todo — File-based task list backed by $PI_SESSION_STORAGE/TODO.md
 *
 * The agent manages TODO.md via standard Write/Edit tools.
 * This module provides:
 *   - Parsing of the markdown checkbox format
 *   - State sync from session storage
 *   - Status-bar widget
 *   - /todo command for interactive overlay
 */

import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionCommandContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import path from "node:path";
import type { AppState } from "../state.js";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface TodoItem {
  text: string;
  done: boolean;
}

// ─── Parsing ───────────────────────────────────────────────────────────────────

const TODO_LINE_RE = /^- \[([ xX])\] (.+)$/;

/**
 * Parse a TODO.md file into todo items.
 * Returns null if any non-blank line fails to match the expected format.
 */
export function parseTodoFile(content: string): Array<TodoItem> | null {
  const items: TodoItem[] = [];

  for (const line of content.split("\n")) {
    const trimmed = line.trimEnd();
    if (trimmed === "") continue;

    const match = trimmed.match(TODO_LINE_RE);
    if (!match) return null;

    items.push({
      done: match[1].toLowerCase() === "x",
      text: match[2],
    });
  }

  return items;
}

// ─── State Sync ────────────────────────────────────────────────────────────────

/**
 * Sync todo state from session storage tracked files.
 * Must be called after resyncSessionStorage().
 */
export function syncTodoStateFromStorage(state: AppState): void {
  const dir = state.sessionStorage.dir;
  if (!dir) {
    state.todo.items = null;
    state.todo.lastRawContent = null;
    return;
  }

  const todoPath = path.join(dir, "TODO.md");
  const tracked = state.sessionStorage.trackedFiles.get(todoPath);

  if (!tracked) {
    state.todo.items = null;
    state.todo.lastRawContent = null;
    state.todo.parseErrorNotified = false;
    return;
  }

  const raw = tracked.content;

  // If content changed, reset the parse error notification flag
  if (raw !== state.todo.lastRawContent) {
    state.todo.parseErrorNotified = false;
    state.todo.lastRawContent = raw;
  }

  state.todo.items = parseTodoFile(raw);
}

// ─── UI Component ──────────────────────────────────────────────────────────────

class TodoListComponent {
  private todos: TodoItem[];
  private theme: Theme;
  private onClose: () => void;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(todos: TodoItem[], theme: Theme, onClose: () => void) {
    this.todos = todos;
    this.theme = theme;
    this.onClose = onClose;
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
      this.onClose();
    }
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const lines: string[] = [];
    const th = this.theme;

    lines.push("");
    const title = th.fg("accent", " Todos ");
    const headerLine =
      th.fg("borderMuted", "─".repeat(3)) +
      title +
      th.fg("borderMuted", "─".repeat(Math.max(0, width - 10)));
    lines.push(truncateToWidth(headerLine, width));
    lines.push("");

    if (this.todos.length === 0) {
      lines.push(
        truncateToWidth(
          `  ${th.fg("dim", "No todos yet. Ask the agent to add some!")}`,
          width,
        ),
      );
    } else {
      const done = this.todos.filter((t) => t.done).length;
      const total = this.todos.length;
      lines.push(
        truncateToWidth(
          `  ${th.fg("muted", `${done}/${total} completed`)}`,
          width,
        ),
      );
      lines.push("");

      for (const todo of this.todos) {
        const check = todo.done ? th.fg("success", "✓") : th.fg("dim", "○");
        const text = todo.done
          ? th.fg("dim", todo.text)
          : th.fg("text", todo.text);
        lines.push(truncateToWidth(`  ${check} ${text}`, width));
      }
    }

    lines.push("");
    lines.push(
      truncateToWidth(`  ${th.fg("dim", "Press Escape to close")}`, width),
    );
    lines.push("");

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  updateTodos(newTodos: TodoItem[]): void {
    this.todos = newTodos;
    this.invalidate();
  }
}

// ─── Widget ────────────────────────────────────────────────────────────────────

/** Determine if the widget should be shown */
function shouldShowWidget(state: AppState): boolean {
  if (state.todo.widgetVisibility === true) return true;
  if (state.todo.widgetVisibility === false) return false;
  return state.todo.items !== null && state.todo.items.length > 0;
}

/** Update the widget display */
export function refreshTodoWidget(state: AppState, ctx: ExtensionContext) {
  if (shouldShowWidget(state)) {
    ctx.ui.setWidget("todos", (_tui, theme) => {
      return {
        invalidate() {},
        render(width: number): string[] {
          const th = theme;
          const todos = state.todo.items;

          if (!todos || todos.length === 0) {
            return [th.fg("dim", "No todos")];
          }

          const done = todos.filter((t) => t.done).length;
          const total = todos.length;

          // Find the last contiguous completed todo
          let startIdx = 0;
          for (let i = todos.length - 1; i >= 0; i--) {
            if (todos[i].done) {
              startIdx = i;
              break;
            }
          }

          let line = th.fg("accent", `${done}/${total} TODOs  `);

          for (let i = startIdx; i < todos.length; i++) {
            const todo = todos[i];
            const check = todo.done ? th.fg("success", "✓") : th.fg("dim", "○");
            const text = todo.done
              ? th.fg("dim", todo.text)
              : th.fg("muted", todo.text);
            const itemStr = `${check} ${text}  `;
            line += itemStr;
          }

          return [truncateToWidth(line, width)];
        },
      };
    });
  } else {
    ctx.ui.setWidget("todos", undefined);
  }
}

// ─── Commands ──────────────────────────────────────────────────────────────────

export function registerTodoCommands(state: AppState, pi: ExtensionAPI) {
  pi.registerCommand("todo", {
    description: "Manage todos: /todo [list|show|hide]",
    getArgumentCompletions: (prefix) => {
      const subcommands = ["list", "show", "hide"];
      const filtered = subcommands.filter((s) => s.startsWith(prefix));
      return filtered.length > 0
        ? filtered.map((s) => ({ value: s, label: s }))
        : null;
    },
    handler: async (args, ctx: ExtensionCommandContext) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("/todo requires interactive mode", "error");
        return;
      }

      const subcommand = args.trim().toLowerCase();

      if (subcommand === "list" || subcommand === "") {
        const items = state.todo.items ?? [];
        await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
          return new TodoListComponent(items, theme, () => done());
        });
      } else if (subcommand === "show") {
        state.todo.widgetVisibility = true;
        refreshTodoWidget(state, ctx);
        ctx.ui.notify("Todo widget shown (manual)", "info");
      } else if (subcommand === "hide") {
        state.todo.widgetVisibility = false;
        refreshTodoWidget(state, ctx);
        ctx.ui.notify("Todo widget hidden (manual)", "info");
      } else {
        ctx.ui.notify(
          `Unknown todo subcommand: ${subcommand}. Use: list (default), show, or hide`,
          "warning",
        );
      }
    },
  });
}
