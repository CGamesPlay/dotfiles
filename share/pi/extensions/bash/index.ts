/**
 * Bash Extension — Entry Point
 *
 * Bash-tee pipeline injection: rewrites `cmd | grep PATTERN` style pipelines
 * to `cmd | tee tempfile | grep PATTERN` so the unfiltered output is
 * recoverable, and appends a note pointing at the tee file when the filter
 * actually dropped output.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  isToolCallEventType,
  isBashToolResult,
} from "@mariozechner/pi-coding-agent";
import { statSync } from "node:fs";
import { injectTee, formatSize } from "./lib/bash-pipeline.js";

export default function (pi: ExtensionAPI) {
  const activeTees = new Map<
    string,
    { teePath: string; originalCommand: string }
  >();

  pi.on("tool_call", async (event: any) => {
    if (!isToolCallEventType("bash", event)) return;

    if (event.input.timeout === undefined) {
      event.input.timeout = 120;
    }

    const result = injectTee(event.input.command);
    if (!result) return;

    activeTees.set(event.toolCallId, {
      teePath: result.teePath,
      originalCommand: event.input.command,
    });
    event.input.command = result.modified;
  });

  pi.on("tool_result", async (event: any) => {
    if (!isBashToolResult(event)) return;

    const info = activeTees.get(event.toolCallId);
    if (!info) return;
    activeTees.delete(event.toolCallId);

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
  });
}
