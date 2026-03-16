/**
 * Elapsed Timer Extension
 *
 * Shows a running elapsed-time counter in the footer status bar while the agent is working.
 * Timer starts on agent_start, ticks every second, and stops on agent_end.
 * The final elapsed time remains visible after the agent finishes.
 */

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";

const STATUS_KEY = "elapsed-timer";

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `⏱ ${m}:${s.toString().padStart(2, "0")}`;
}

export default function (pi: ExtensionAPI) {
  let timer: ReturnType<typeof setInterval> | null = null;
  let startTime: number | undefined;

  function stopTimer(_ctx: ExtensionContext) {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function startTimer(ctx: ExtensionContext) {
    stopTimer(ctx);
    startTime = Date.now();
    ctx.ui.setStatus(STATUS_KEY, formatElapsed(0));

    timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime!) / 1000);
      ctx.ui.setStatus(STATUS_KEY, formatElapsed(elapsed));
    }, 1000);
  }

  pi.on("agent_start", async (_event, ctx) => {
    startTimer(ctx);
  });

  pi.on("agent_end", async (_event, ctx) => {
    stopTimer(ctx);
    // Final time stays displayed until next run
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    stopTimer(ctx);
    ctx.ui.setStatus(STATUS_KEY, undefined);
  });
}
