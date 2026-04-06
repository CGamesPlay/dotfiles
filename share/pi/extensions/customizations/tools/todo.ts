/**
 * Todo Tool, /todo Command, and Widget
 *
 * Provides a todo list that the LLM can manage via a tool, with state
 * persisted in session entries (enabling proper branching behavior).
 */

import { StringEnum } from "@mariozechner/pi-ai";
import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionCommandContext,
  Theme,
} from "@mariozechner/pi-coding-agent";
import { matchesKey, Text, truncateToWidth } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import type { AppState } from "../state.js";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Todo {
  id: number;
  text: string;
  done: boolean;
}

interface TodoDetails {
  action: "list" | "add" | "toggle" | "clear";
  todos: Todo[];
  nextId: number;
  error?: string;
}

const TodoParams = Type.Object({
  action: StringEnum(["list", "add", "toggle", "clear"] as const),
  text: Type.Optional(Type.String({ description: "Todo text (for add)" })),
  id: Type.Optional(Type.Number({ description: "Todo ID (for toggle)" })),
});

// ─── UI Component ──────────────────────────────────────────────────────────────

class TodoListComponent {
  private todos: Todo[];
  private theme: Theme;
  private onClose: () => void;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(todos: Todo[], theme: Theme, onClose: () => void) {
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
        const id = th.fg("accent", `#${todo.id}`);
        const text = todo.done
          ? th.fg("dim", todo.text)
          : th.fg("text", todo.text);
        lines.push(truncateToWidth(`  ${check} ${id} ${text}`, width));
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

  updateTodos(newTodos: Todo[]): void {
    this.todos = newTodos;
    this.invalidate();
  }
}

// ─── State Helpers ─────────────────────────────────────────────────────────────

/** Reconstruct todo state from session entries */
export function reconstructTodoState(state: AppState, ctx: ExtensionContext) {
  state.todo.items = [];
  state.todo.nextId = 1;

  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type !== "message") continue;
    const msg = entry.message;
    if (msg.role !== "toolResult" || msg.toolName !== "todo") continue;

    const details = msg.details as TodoDetails | undefined;
    if (details) {
      state.todo.items = details.todos;
      state.todo.nextId = details.nextId;
    }
  }
}

/** Determine if the widget should be shown */
function shouldShowWidget(state: AppState): boolean {
  if (state.todo.widgetVisibility === true) return true;
  if (state.todo.widgetVisibility === false) return false;
  return state.todo.items.length > 0;
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

          if (todos.length === 0) {
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
            const id = th.fg("accent", `#${todo.id}`);
            const text = todo.done
              ? th.fg("dim", todo.text)
              : th.fg("muted", todo.text);
            const itemStr = `${check} ${id} ${text}  `;
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

// ─── Registration ──────────────────────────────────────────────────────────────

export function registerTodoTool(state: AppState, pi: ExtensionAPI) {
  pi.registerTool({
    name: "todo",
    label: "Todo",
    description:
      "Manage a todo list. Actions: list, add (text), toggle (id), clear",
    parameters: TodoParams,

    async execute(_toolCallId, params, _signal, onUpdate, ctx) {
      const todos = state.todo.items;

      // Auto-show the widget when the agent uses the todo tool (unless user explicitly hid it)
      if (state.todo.widgetVisibility !== false && ctx.hasUI) {
        refreshTodoWidget(state, ctx);
      }

      const emitUpdate = (action: TodoDetails["action"]) => {
        if (!onUpdate) return;
        const details: TodoDetails = {
          action,
          todos: [...todos],
          nextId: state.todo.nextId,
        };
        onUpdate({
          content: [
            {
              type: "text",
              text: todos.length
                ? todos
                    .map((t) => `[${t.done ? "x" : " "}] #${t.id}: ${t.text}`)
                    .join("\n")
                : "No todos",
            },
          ],
          details,
        });
      };

      switch (params.action) {
        case "list":
          return {
            content: [
              {
                type: "text",
                text: todos.length
                  ? todos
                      .map((t) => `[${t.done ? "x" : " "}] #${t.id}: ${t.text}`)
                      .join("\n")
                  : "No todos",
              },
            ],
            details: {
              action: "list",
              todos: [...todos],
              nextId: state.todo.nextId,
            } as TodoDetails,
          };

        case "add": {
          if (!params.text) {
            return {
              content: [{ type: "text", text: "Error: text required for add" }],
              details: {
                action: "add",
                todos: [...todos],
                nextId: state.todo.nextId,
                error: "text required",
              } as TodoDetails,
            };
          }
          const newTodo: Todo = {
            id: state.todo.nextId++,
            text: params.text,
            done: false,
          };
          todos.push(newTodo);
          emitUpdate("add");
          return {
            content: [
              {
                type: "text",
                text: `Added todo #${newTodo.id}: ${newTodo.text}`,
              },
            ],
            details: {
              action: "add",
              todos: [...todos],
              nextId: state.todo.nextId,
            } as TodoDetails,
          };
        }

        case "toggle": {
          if (params.id === undefined) {
            return {
              content: [
                { type: "text", text: "Error: id required for toggle" },
              ],
              details: {
                action: "toggle",
                todos: [...todos],
                nextId: state.todo.nextId,
                error: "id required",
              } as TodoDetails,
            };
          }
          const todo = todos.find((t) => t.id === params.id);
          if (!todo) {
            return {
              content: [{ type: "text", text: `Todo #${params.id} not found` }],
              details: {
                action: "toggle",
                todos: [...todos],
                nextId: state.todo.nextId,
                error: `#${params.id} not found`,
              } as TodoDetails,
            };
          }
          todo.done = !todo.done;
          emitUpdate("toggle");
          return {
            content: [
              {
                type: "text",
                text: `Todo #${todo.id} ${todo.done ? "completed" : "uncompleted"}`,
              },
            ],
            details: {
              action: "toggle",
              todos: [...todos],
              nextId: state.todo.nextId,
            } as TodoDetails,
          };
        }

        case "clear": {
          const count = todos.length;
          state.todo.items = [];
          state.todo.nextId = 1;
          emitUpdate("clear");
          return {
            content: [{ type: "text", text: `Cleared ${count} todos` }],
            details: {
              action: "clear",
              todos: [],
              nextId: 1,
            } as TodoDetails,
          };
        }

        default:
          return {
            content: [
              { type: "text", text: `Unknown action: ${params.action}` },
            ],
            details: {
              action: "list",
              todos: [...todos],
              nextId: state.todo.nextId,
              error: `unknown action: ${params.action}`,
            } as TodoDetails,
          };
      }
    },

    renderCall(args, theme) {
      let text =
        theme.fg("toolTitle", theme.bold("todo ")) +
        theme.fg("muted", args.action);
      if (args.text) text += ` ${theme.fg("dim", `"${args.text}"`)}`;
      if (args.id !== undefined)
        text += ` ${theme.fg("accent", `#${args.id}`)}`;
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded }, theme) {
      const details = result.details as TodoDetails | undefined;
      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "", 0, 0);
      }

      if (details.error) {
        return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);
      }

      const todoList = details.todos;

      switch (details.action) {
        case "list": {
          if (todoList.length === 0) {
            return new Text(theme.fg("dim", "No todos"), 0, 0);
          }
          let listText = theme.fg("muted", `${todoList.length} todo(s):`);
          const display = expanded ? todoList : todoList.slice(0, 5);
          for (const t of display) {
            const check = t.done
              ? theme.fg("success", "✓")
              : theme.fg("dim", "○");
            const itemText = t.done
              ? theme.fg("dim", t.text)
              : theme.fg("muted", t.text);
            listText += `\n${check} ${theme.fg("accent", `#${t.id}`)} ${itemText}`;
          }
          if (!expanded && todoList.length > 5) {
            listText += `\n${theme.fg("dim", `... ${todoList.length - 5} more`)}`;
          }
          return new Text(listText, 0, 0);
        }

        case "add": {
          const added = todoList[todoList.length - 1];
          return new Text(
            theme.fg("success", "✓ Added ") +
              theme.fg("accent", `#${added.id}`) +
              " " +
              theme.fg("muted", added.text),
            0,
            0,
          );
        }

        case "toggle": {
          const text = result.content[0];
          const msg = text?.type === "text" ? text.text : "";
          return new Text(
            theme.fg("success", "✓ ") + theme.fg("muted", msg),
            0,
            0,
          );
        }

        case "clear":
          return new Text(
            theme.fg("success", "✓ ") + theme.fg("muted", "Cleared all todos"),
            0,
            0,
          );
      }
    },
  });
}

export function registerTodoCommands(state: AppState, pi: ExtensionAPI) {
  pi.registerCommand("todo", {
    description: "Manage todos: /todo [list|show|hide] or use the todo tool",
    handler: async (args, ctx: ExtensionCommandContext) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("/todo requires interactive mode", "error");
        return;
      }

      const subcommand = args.trim().toLowerCase();

      if (subcommand === "list" || subcommand === "") {
        await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
          return new TodoListComponent(state.todo.items, theme, () => done());
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
