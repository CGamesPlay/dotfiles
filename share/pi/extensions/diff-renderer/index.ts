/**
 * Diff Renderer Extension — Entry Point
 *
 * Registers custom edit and write tools that show minimal colored diffs
 * instead of raw tool call arguments.
 */

import type {
  EditToolDetails,
  ExtensionAPI,
} from "@mariozechner/pi-coding-agent";
import { createEditTool, createWriteTool } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { readFileSync } from "fs";

import { resolve } from "path";
import {
  computeDiffLines,
  collectEditDiffLines,
  trimTrailingRemovals,
  stripLineNumbers,
  trimContext,
  parsePiDiff,
  formatDiffLines,
  formatCollapsibleAtFrontier,
  diffSummary,
  renderDiffResult,
  renderWrittenContent,
  type DiffLine,
} from "./lib/diff.js";

export default function (pi: ExtensionAPI) {
  const cwd = process.cwd();

  // --- Edit tool ---
  const originalEdit = createEditTool(cwd);
  pi.registerTool({
    name: "edit",
    label: "edit",
    description: originalEdit.description,
    parameters: originalEdit.parameters,
    // Built-in edit uses renderShell: "self" for its async diff preview.
    // Our diff is computed synchronously, so opt back into the TUI's shell.
    renderShell: "default",

    async execute(toolCallId, params, signal, onUpdate) {
      return originalEdit.execute(toolCallId, params, signal, onUpdate);
    },

    renderCall(args, theme, context) {
      let text = theme.fg("toolTitle", theme.bold("edit "));
      text += theme.fg("accent", args.path ?? "");

      // Show mini-diff from args while in-flight (no final result yet).
      // Strip line numbers since they're snippet-relative.
      if (context.isPartial) {
        const allLines = trimTrailingRemovals(collectEditDiffLines(args));
        if (allLines.length) {
          stripLineNumbers(allLines);
          text += "\n" + renderDiffResult(allLines, context.expanded, theme);
        }
      }

      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded, isPartial }, theme, context) {
      // During execution, renderCall handles the preview diff
      if (isPartial) return new Text("", 0, 0);

      if (context.isError) {
        const errorText = result.content
          .filter((c) => c.type === "text")
          .map((c) => (c as { text?: string }).text ?? "")
          .join("\n");
        return new Text(theme.fg("error", errorText), 0, 0);
      }

      const details = result.details as EditToolDetails | undefined;
      const content = result.content[0];

      // Prefer the full-file diff from details (has correct line numbers);
      // fall back to diffing the args (line numbers relative to snippet).
      let diffLines: DiffLine[] | undefined;
      if (details?.diff) {
        diffLines = trimContext(parsePiDiff(details.diff), 1);
      }
      if (!diffLines?.length) {
        diffLines = collectEditDiffLines(context.args);
      }

      if (!diffLines?.length) {
        const msg = content?.type === "text" ? content.text : "Done";
        return new Text(theme.fg("success", msg), 0, 0);
      }

      return new Text(renderDiffResult(diffLines, expanded, theme), 0, 0);
    },
  });

  // --- Write tool ---
  const originalWrite = createWriteTool(cwd);

  interface WriteRenderState {
    /** The path we loaded oldContent for (cache key). */
    oldContentPath?: string;
    /** Old file content; '' = new file; undefined = not yet loaded. */
    oldContent?: string;
    /** Non-ENOENT read error message. */
    oldContentError?: string;
  }

  pi.registerTool({
    name: "write",
    label: "write",
    description: originalWrite.description,
    parameters: originalWrite.parameters,

    async execute(toolCallId, params, signal, onUpdate) {
      return originalWrite.execute(toolCallId, params, signal, onUpdate);
    },

    renderCall(args, theme, context) {
      const state = context.state as WriteRenderState;
      const isReplay = !context.isPartial && !context.executionStarted;

      // Load old content synchronously before execute writes.
      // Wait for content to start streaming — that practically guarantees the
      // path is complete, but we also key the cache on the resolved path so a
      // partial path from an earlier render doesn't stick.
      const resolvedPath = args.path ? resolve(cwd, args.path) : undefined;
      if (
        resolvedPath &&
        args.content &&
        !isReplay &&
        state.oldContentPath !== resolvedPath
      ) {
        state.oldContentPath = resolvedPath;
        state.oldContentError = undefined;
        try {
          state.oldContent = readFileSync(resolvedPath, "utf-8");
        } catch (err: unknown) {
          const code = (err as NodeJS.ErrnoException)?.code;
          if (code === "ENOENT") {
            state.oldContent = ""; // New file
          } else {
            state.oldContent = undefined;
            state.oldContentError = `${code ?? err}`;
          }
        }
      }

      let text = theme.fg("toolTitle", theme.bold("write "));
      text += theme.fg("accent", args.path ?? "");

      const newContent = args.content ?? "";
      if (!newContent) return new Text(text, 0, 0);

      if (isReplay) {
        // Can't recover old content on replay — show file listing
        text +=
          "\n" + renderWrittenContent(newContent, context.expanded, theme);
      } else if (state.oldContent !== undefined) {
        const diffLines = computeDiffLines(state.oldContent, newContent);
        if (diffLines.length) {
          // Trim excess trailing removals — during streaming the diff tail
          // contains old-file lines not yet replaced. We only keep as many
          // trailing removals as are unaccounted for by the additions above.
          const trimmed = trimTrailingRemovals(diffLines);
          const formatted = formatDiffLines(trimmed, theme);
          const isNewFile = state.oldContent === "";
          const suffix = isNewFile ? theme.fg("muted", " (new file)") : "";
          const summary = diffSummary(trimmed, theme) + suffix;
          text +=
            "\n" +
            formatCollapsibleAtFrontier(
              formatted,
              trimmed,
              summary,
              context.expanded,
              theme,
            );
        }
      }

      if (state.oldContentError) {
        text +=
          "\n" +
          theme.fg(
            "warning",
            `⚠ could not read old file: ${state.oldContentError}`,
          );
      }

      return new Text(text, 0, 0);
    },

    renderResult(result, _opts, theme, context) {
      if (context.isError) {
        const errorText = result.content
          .filter((c) => c.type === "text")
          .map((c) => (c as { text?: string }).text ?? "")
          .join("\n");
        return new Text(theme.fg("error", errorText), 0, 0);
      }
      // Success path: rendering handled by renderCall; suppress built-in message
      return new Text("", 0, 0);
    },
  });
}
