/**
 * Terminal Escape Sequence Helpers
 *
 * OSC 11 color parsing and theme detection, plus iTerm2 notification escape sequences.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

// ─── Constants ─────────────────────────────────────────────────────────────────

const OSC_11_QUERY = "\x1b]11;?\x07";
const TIMEOUT_MS = 500;

/** Delay before firing agent-end notification (ms) */
export const DELAY_MS = 15_000;

// ─── OSC 11 Theme Detection ───────────────────────────────────────────────────

export function parseRgbColor(
  colorStr: string,
): { r: number; g: number; b: number } | null {
  const match = colorStr.match(
    /rgb:([0-9a-fA-F]+)\/([0-9a-fA-F]+)\/([0-9a-fA-F]+)/,
  );
  if (!match) return null;

  const [, rHex, gHex, bHex] = match;
  const maxValue = rHex.length === 4 ? 0xffff : 0xff;

  return {
    r: parseInt(rHex, 16) / maxValue,
    g: parseInt(gHex, 16) / maxValue,
    b: parseInt(bHex, 16) / maxValue,
  };
}

export function queryOsc11(ctx: ExtensionContext) {
  let responseBuffer = "";
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let unsubscribe: (() => void) | null = null;
  let completed = false;

  const cleanup = () => {
    completed = true;
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    responseBuffer = "";
  };

  const processOsc11Response = (response: string) => {
    // response is like "\x1b]11;rgb:1e1e/1e1e/1e1e" (terminator already stripped)
    const colorPart = response.replace(/^\x1b\]11;/, "");
    const rgb = parseRgbColor(colorPart);
    if (!rgb) return;

    const luminance = (rgb.r + rgb.g + rgb.b) / 3;
    ctx.ui.setTheme(luminance < 0.5 ? "dark" : "light");
  };

  unsubscribe = ctx.ui.onTerminalInput((data: string) => {
    if (completed) return undefined;

    const isOscStart = data.startsWith("\x1b]11;");
    const isPartialResponse = responseBuffer.length > 0;

    if (!isOscStart && !isPartialResponse) {
      // Not an OSC 11 response — pass through
      return undefined;
    }

    responseBuffer += data;

    // Look for BEL (\x07) or ST (\x1b\\) terminator
    const belIndex = responseBuffer.indexOf("\x07");
    const stIndex = responseBuffer.indexOf("\x1b\\");

    let terminatorIndex = -1;
    let terminatorLength = 0;

    if (belIndex !== -1 && (stIndex === -1 || belIndex < stIndex)) {
      terminatorIndex = belIndex;
      terminatorLength = 1;
    } else if (stIndex !== -1) {
      terminatorIndex = stIndex;
      terminatorLength = 2;
    }

    if (terminatorIndex !== -1) {
      const response = responseBuffer.substring(0, terminatorIndex);
      const remainder = responseBuffer.substring(
        terminatorIndex + terminatorLength,
      );

      processOsc11Response(response);
      cleanup();

      // Pass through any data that arrived after the terminator
      return remainder.length > 0
        ? { consume: true, data: remainder }
        : { consume: true };
    }

    // Still accumulating — consume and wait for more data
    return { consume: true };
  });

  // Send the OSC 11 query
  process.stdout.write(OSC_11_QUERY);

  // Timeout: silently give up if terminal doesn't respond
  timeoutId = setTimeout(cleanup, TIMEOUT_MS);
}

// ─── iTerm2 Notifications ──────────────────────────────────────────────────────

export function notify(
  titleText: string,
  messageText = "I've finished working",
) {
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
