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
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import path from "node:path";
import { queryOsc11, notify, DELAY_MS } from "./lib/terminal.js";

const STATUS_KEY = "00-clock";

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `⏱ ${m}:${s.toString().padStart(2, "0")}`;
}

export default function (pi: ExtensionAPI) {
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
  };

  // ── Session Start ──────────────────────────────────────
  pi.on("session_start", (_event, ctx: ExtensionContext) => {
    if (!ctx.hasUI) return;

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
  });

  // ── Agent End ──────────────────────────────────────────
  pi.on("agent_end", (event, ctx: ExtensionContext) => {
    if (state.timer.interval) {
      clearInterval(state.timer.interval);
      state.timer.interval = null;
    }

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
