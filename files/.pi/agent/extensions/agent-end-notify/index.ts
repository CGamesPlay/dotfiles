/**
 * Agent End Notify Extension
 *
 * Plays a sound, bounces the iTerm2 Dock icon, and sends a notification when
 * the agent finishes responding to a prompt — but only if no terminal input is
 * received within 30 seconds of the agent finishing.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import path from "node:path";

const DELAY_MS = 30_000;

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
    // Keep a single terminal input listener alive for the whole session
    ctx.ui.onTerminalInput(() => {
      cancelTimer();
    });
  });

  pi.on("agent_end", async (event, ctx) => {
    // Skip in non-interactive (print/RPC) mode
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

    // Replace any existing pending notification
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
