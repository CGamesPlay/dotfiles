/**
 * TUI Extension — Entry Point
 *
 * Handles terminal UI concerns:
 * - OSC 11 theme detection (dark/light)
 * - iTerm2 notifications on agent end
 * - Terminal focus reporting
 */

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { queryOsc11, notify, DELAY_MS } from "./lib/terminal.js";
import { createFooterFactory } from "./lib/footer.js";

const CAFFEINATE_IDLE_KILL_DELAY_MS = 20_000;

const STATUS_KEY = "clock";

const STATUS_IDLE = "⏱ -:--";

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `⏱ ${m}:${s.toString().padStart(2, "0")}`;
}

export default function (pi: ExtensionAPI) {
  function setTabTitle(
    ctx: ExtensionContext,
    titleState: "idle" | "working" | "choice",
  ) {
    const name = pi.getSessionName();
    const base = path.basename(ctx.cwd);
    const piTitle = name ? `π - ${name} - ${base}` : `π - ${base}`;
    const emoji =
      titleState === "working" ? "⚙️" : titleState === "choice" ? "🔴" : "💤";
    ctx.ui.setTitle(`${emoji} ${piTitle}`);
  }

  // Only activate if stdout is a TTY (terminal)
  if (!process.stdout.isTTY) {
    return;
  }

  const state = {
    notify: {
      delayTimer: undefined as ReturnType<typeof setTimeout> | undefined,
    },
    timer: {
      interval: null as ReturnType<typeof setInterval> | null,
      startTime: undefined as number | undefined,
    },
    caffeinate: {
      process: undefined as ChildProcess | undefined,
      killTimer: undefined as ReturnType<typeof setTimeout> | undefined,
    },
    ctx: undefined as ExtensionContext | undefined,
    pi: pi as typeof pi | undefined,
  };

  const footerFactory = createFooterFactory(state);

  const caffeinateEnabled = process.platform === "darwin";

  const scheduleCaffeinateKill = (_ctx: ExtensionCommandContext) => {
    if (!state.caffeinate.process) return;
    if (state.caffeinate.killTimer) return;

    state.caffeinate.killTimer = setTimeout(() => {
      state.caffeinate.killTimer = undefined;
      if (!state.caffeinate.process) return;
      if (state.ctx?.isIdle()) {
        state.caffeinate.process.kill();
        state.caffeinate.process = undefined;
      } else {
        pi.runWhenIdle(scheduleCaffeinateKill);
      }
    }, CAFFEINATE_IDLE_KILL_DELAY_MS);
    state.caffeinate.killTimer.unref();
  };

  // ── Session Start ──────────────────────────────────────
  pi.on("session_start", (_event, ctx: ExtensionContext) => {
    if (!ctx.hasUI) return;

    state.ctx = ctx;

    ctx.ui.setStatus(STATUS_KEY, STATUS_IDLE);
    ctx.ui.setFooter(footerFactory);

    // Enable terminal focus reporting (for agent-end notification)
    process.stdout.write("\x1b[?1004h");

    ctx.ui.onTerminalInput((data) => {
      if (data === "\x1b[O") {
        return { consume: true };
      }
      // Focus gained or any input — cancel notification timer
      if (state.notify.delayTimer !== undefined) {
        clearTimeout(state.notify.delayTimer);
        state.notify.delayTimer = undefined;
      }
      if (data === "\x1b[I") {
        return { consume: true };
      }
      return undefined;
    });

    // Query OSC 11 for theme
    queryOsc11(ctx);

    // Defer to macrotask so pi's updateTerminalTitle() (called after session_start
    // resolves in rebindCurrentSession) runs first, then we overwrite it.
    setTimeout(() => setTabTitle(ctx, "idle"), 0);
  });

  // ── Session Tree ───────────────────────────────────────
  pi.on("session_tree", (_event, ctx: ExtensionContext) => {
    if (ctx.hasUI) {
      queryOsc11(ctx);
    }
  });

  // ── Agent Start ────────────────────────────────────────
  pi.on("agent_start", (_event, ctx: ExtensionContext) => {
    // Cancel any pending notification — a previous agent_end may have fired
    // spuriously (e.g. another extension sending a message, server error retry).
    if (state.notify.delayTimer !== undefined) {
      clearTimeout(state.notify.delayTimer);
      state.notify.delayTimer = undefined;
    }

    if (state.timer.interval) {
      clearInterval(state.timer.interval);
      state.timer.interval = null;
    }
    state.timer.startTime = Date.now();
    ctx.ui.setStatus(STATUS_KEY, formatElapsed(0));

    state.timer.interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - state.timer.startTime!) / 1000);
      ctx.ui.setStatus(STATUS_KEY, formatElapsed(elapsed));
    }, 1000);

    if (caffeinateEnabled) {
      // We're working again — cancel any pending idle-kill so the existing
      // caffeinate keeps running.
      if (state.caffeinate.killTimer) {
        clearTimeout(state.caffeinate.killTimer);
        state.caffeinate.killTimer = undefined;
      }

      if (!state.caffeinate.process) {
        const child = spawn("caffeinate", ["-i", "-w", String(process.pid)], {
          stdio: "ignore",
        });
        state.caffeinate.process = child;
        child.on("exit", () => {
          if (state.caffeinate.process === child) {
            state.caffeinate.process = undefined;
          }
        });
        child.on("error", () => {
          if (state.caffeinate.process === child) {
            state.caffeinate.process = undefined;
          }
        });
      }

      pi.runWhenIdle(scheduleCaffeinateKill);
    }

    setTabTitle(ctx, "working");
  });

  // ── Agent End ──────────────────────────────────────────
  pi.on("agent_end", (event, ctx: ExtensionContext) => {
    if (state.timer.interval) {
      clearInterval(state.timer.interval);
      state.timer.interval = null;
    }
    ctx.ui.setStatus(STATUS_KEY, STATUS_IDLE);
    setTabTitle(ctx, "idle");

    if (!ctx.hasUI) return;

    const sessionName = pi.getSessionName();
    const dirName = path.basename(ctx.cwd);
    const titleText = `pi: ${sessionName ?? dirName}`;

    // Extract the first 20 words of the last assistant message
    const lastAssistant = [...event.messages]
      .reverse()
      .find((m: any) => m.role === "assistant") as any;
    const text: string =
      lastAssistant?.content
        ?.filter((c: any) => c.type === "text")
        ?.map((c: any) => c.text)
        ?.join(" ") ?? "";
    const snippet = text.split(/\s+/).slice(0, 20).join(" ");
    const messageText = snippet.length > 0 ? snippet : "I've finished working";

    // Cancel any existing timer
    if (state.notify.delayTimer !== undefined) {
      clearTimeout(state.notify.delayTimer);
      state.notify.delayTimer = undefined;
    }

    state.notify.delayTimer = setTimeout(() => {
      state.notify.delayTimer = undefined;
      notify(titleText, messageText);
    }, DELAY_MS).unref();
  });

  // ── Cross-Extension: Waiting For User ──────────────────
  // Other extensions (e.g. session-state's finish_plan tool) emit this when
  // they open a blocking UI element so the user, who may have switched away,
  // gets the same delayed notification used for agent_end.
  pi.events.on("tui:waiting-for-user", (data) => {
    if (!state.ctx?.hasUI) return;
    const payload = data as { title: string; message: string };

    if (state.notify.delayTimer !== undefined) {
      clearTimeout(state.notify.delayTimer);
      state.notify.delayTimer = undefined;
    }

    state.notify.delayTimer = setTimeout(() => {
      state.notify.delayTimer = undefined;
      notify(payload.title, payload.message);
    }, DELAY_MS).unref();

    setTabTitle(state.ctx, "choice");
  });

  // ── Tool Execution End ───────────────────────────────────────────────
  pi.on("tool_execution_end", (_event, ctx: ExtensionContext) => {
    setTabTitle(ctx, "working");
  });

  // ── Session Shutdown ───────────────────────────────────
  pi.on("session_shutdown", (_event, ctx: ExtensionContext) => {
    // Clear notification timer
    if (state.notify.delayTimer !== undefined) {
      clearTimeout(state.notify.delayTimer);
      state.notify.delayTimer = undefined;
    }

    // Stop elapsed timer
    if (state.timer.interval) {
      clearInterval(state.timer.interval);
      state.timer.interval = null;
    }
    if (ctx.hasUI) {
      ctx.ui.setStatus(STATUS_KEY, undefined);
    }

    // Disable focus reporting
    if (ctx.hasUI) {
      process.stdout.write("\x1b[?1004l");
    }

    if (caffeinateEnabled) {
      if (state.caffeinate.killTimer) {
        clearTimeout(state.caffeinate.killTimer);
        state.caffeinate.killTimer = undefined;
      }
      if (state.caffeinate.process) {
        state.caffeinate.process.kill();
        state.caffeinate.process = undefined;
      }
    }

    state.ctx = undefined;
  });

  // ── Commands ───────────────────────────────────────────
  pi.registerCommand("notify-test", {
    description: "Test the agent-end notification (fires after 2s)",
    handler: async (_args, ctx) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const sessionName = pi.getSessionName();
      const dirName = path.basename(ctx.cwd);
      notify(`pi: ${sessionName ?? dirName}`);
    },
  });
}
