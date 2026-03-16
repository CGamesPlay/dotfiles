/**
 * Agent End Notify Extension
 *
 * Plays a sound, bounces the iTerm2 Dock icon, and sends a notification when
 * the agent finishes responding to a prompt — but only if the user hasn't
 * engaged with the terminal within 15 seconds of the agent finishing.
 *
 * "Engaged" means: focus gained (via \e[?1004h focus reporting) or any
 * keystroke. Focus lost does not cancel the timer — the notification will
 * still fire if the user doesn't come back.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import path from "node:path";

const DELAY_MS = 15_000;

function notify(titleText: string, messageText = "I've finished working") {
  const title = Buffer.from(titleText).toString("base64");
  const message = Buffer.from(messageText).toString("base64");
  process.stdout.write(
    "\x1b]1337;Custom=id=play-sound:Nintendo/WW_MainMenu_Select.wav\x07",
  );
  process.stdout.write("\x1b]1337;RequestAttention=yes\x07");
  process.stdout.write(
    `\x1b]1337;Notification=message=${message};title=${title}\x07`,
  );
}

export default function (pi: ExtensionAPI) {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const cancelTimer = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return;

    // Enable terminal focus reporting
    process.stdout.write("\x1b[?1004h");

    ctx.ui.onTerminalInput((data) => {
      if (data === "\x1b[O") {
        // Focus lost — don't cancel the timer; consume the event silently
        return { consume: true };
      }
      // Focus gained (\x1b[I) or any other input — user is engaged; cancel timer
      cancelTimer();
      if (data === "\x1b[I") {
        return { consume: true };
      }
      return undefined;
    });
  });

  pi.on("session_shutdown", (_event, ctx) => {
    if (!ctx.hasUI) return;
    process.stdout.write("\x1b[?1004l");
  });

  pi.on("agent_end", async (event, ctx) => {
    if (!ctx.hasUI) return;

    const sessionName = pi.getSessionName();
    const dirName = path.basename(ctx.cwd);
    const titleText = `pi: ${sessionName ?? dirName}`;

    // Extract the first 20 words of the last assistant message
    const lastAssistant = [...event.messages]
      .reverse()
      .find((m) => m.role === "assistant");
    const text =
      lastAssistant?.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join(" ") ?? "";
    const snippet = text.split(/\s+/).slice(0, 20).join(" ");
    const messageText = snippet.length > 0 ? snippet : "I've finished working";

    cancelTimer();
    timer = setTimeout(() => {
      timer = undefined;
      notify(titleText, messageText);
    }, DELAY_MS);
  });

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
