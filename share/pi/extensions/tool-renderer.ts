/**
 * Custom Tool Renderer Extension
 *
 * Overrides built-in edit and write tool rendering to show minimal colored diffs
 * instead of raw tool call arguments.
 *
 * Diff format uses side-by-side line numbers:
 *   10 ⋮ 10 │context line
 *   11 ⋮    │removed line        (red)
 *      ⋮ 11 │added line          (green)
 *
 * During streaming:
 * - write: sync-loads old file content into state on first render, diffs against streaming args.content
 * - edit: diffs args.oldText vs args.newText directly
 *
 * ## ToolRenderContext lifecycle states
 *
 * renderCall is invoked in all states; renderResult only when a result exists.
 * The context fields that matter for deciding what to show:
 *
 * | State                          | argsComplete | executionStarted | isPartial |
 * |--------------------------------|--------------|------------------|-----------|
 * | Live, streaming args           | false        | false            | true      |
 * | Live, args done, pending exec  | true         | false            | true      |
 * | Live, executing                | true         | true             | true      |
 * | Live, execution complete       | true         | true             | false     |
 * | Session replay                 | true         | false            | false     |
 *
 * Key insight: on session replay, executionStarted is never set (markExecutionStarted
 * is only called during live execution). The way to distinguish "replay" from
 * "live pre-execution" is isPartial: it starts true and becomes false only when
 * updateResult() is called with a final result (including during replay).
 *
 * So: `isPartial && !executionStarted` = live, pre-execution (show preview diff)
 *     `!isPartial` = final result exists
 *
 * For the edit tool, renderResult handles the final diff (using details.diff
 * from the built-in tool which has correct file-level line numbers).
 *
 * For the write tool, renderCall handles ALL rendering (streaming preview,
 * execution, and final result). renderResult just returns empty to suppress
 * the built-in "Successfully wrote N bytes" message. Old file content is
 * loaded synchronously on first renderCall to avoid race conditions with
 * the write execution.
 */

import type {
  EditToolDetails,
  ExtensionAPI,
  Theme,
} from "@mariozechner/pi-coding-agent";
import { createEditTool, createWriteTool } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import * as Diff from "diff";
import { readFileSync } from "fs";
import { resolve } from "path";

export const COLLAPSED_MAX_LINES = 10;

// ─── Diff data model ───────────────────────────────────────────────────────────

export interface DiffLine {
  type: "context" | "added" | "removed" | "gap";
  oldNum?: number;
  newNum?: number;
  content: string;
}

// ─── Diff computation ──────────────────────────────────────────────────────────

/**
 * Compute structured diff lines with both old and new line numbers.
 */
export function computeDiffLines(
  oldContent: string,
  newContent: string,
  contextLines = 1,
): DiffLine[] {
  const parts = Diff.diffLines(oldContent, newContent);
  const allLines: DiffLine[] = [];
  let oldLineNum = 1;
  let newLineNum = 1;
  let lastWasChange = false;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const raw = part.value.split("\n");
    if (raw[raw.length - 1] === "") raw.pop();

    if (part.added || part.removed) {
      for (const line of raw) {
        if (part.added) {
          allLines.push({ type: "added", newNum: newLineNum, content: line });
          newLineNum++;
        } else {
          allLines.push({
            type: "removed",
            oldNum: oldLineNum,
            content: line,
          });
          oldLineNum++;
        }
      }
      lastWasChange = true;
    } else {
      const nextIsChange =
        i < parts.length - 1 && (parts[i + 1].added || parts[i + 1].removed);

      if (lastWasChange && nextIsChange) {
        if (raw.length <= contextLines * 2) {
          for (const line of raw) {
            allLines.push({
              type: "context",
              oldNum: oldLineNum,
              newNum: newLineNum,
              content: line,
            });
            oldLineNum++;
            newLineNum++;
          }
        } else {
          for (const line of raw.slice(0, contextLines)) {
            allLines.push({
              type: "context",
              oldNum: oldLineNum,
              newNum: newLineNum,
              content: line,
            });
            oldLineNum++;
            newLineNum++;
          }
          const skipped = raw.length - contextLines * 2;
          allLines.push({ type: "gap", content: "" });
          oldLineNum += skipped;
          newLineNum += skipped;
          for (const line of raw.slice(raw.length - contextLines)) {
            allLines.push({
              type: "context",
              oldNum: oldLineNum,
              newNum: newLineNum,
              content: line,
            });
            oldLineNum++;
            newLineNum++;
          }
        }
      } else if (lastWasChange) {
        const shown = raw.slice(0, contextLines);
        for (const line of shown) {
          allLines.push({
            type: "context",
            oldNum: oldLineNum,
            newNum: newLineNum,
            content: line,
          });
          oldLineNum++;
          newLineNum++;
        }
        if (raw.length > shown.length) {
          allLines.push({ type: "gap", content: "" });
          oldLineNum += raw.length - shown.length;
          newLineNum += raw.length - shown.length;
        }
      } else if (nextIsChange) {
        const skipped = Math.max(0, raw.length - contextLines);
        if (skipped > 0) {
          allLines.push({ type: "gap", content: "" });
          oldLineNum += skipped;
          newLineNum += skipped;
        }
        for (const line of raw.slice(skipped)) {
          allLines.push({
            type: "context",
            oldNum: oldLineNum,
            newNum: newLineNum,
            content: line,
          });
          oldLineNum++;
          newLineNum++;
        }
      } else {
        oldLineNum += raw.length;
        newLineNum += raw.length;
      }
      lastWasChange = false;
    }
  }

  return normalizeGaps(allLines);
}

/**
 * Remove leading/trailing gaps and collapse consecutive gaps into one.
 */
export function normalizeGaps(lines: DiffLine[]): DiffLine[] {
  const result: DiffLine[] = [];
  for (const line of lines) {
    if (line.type === "gap") {
      // Skip if it would be leading or consecutive
      if (result.length === 0 || result[result.length - 1].type === "gap") {
        continue;
      }
    }
    result.push(line);
  }
  // Remove trailing gap
  if (result.length > 0 && result[result.length - 1].type === "gap") {
    result.pop();
  }
  return result;
}

/**
 * Parse pi's built-in diff format into DiffLine[] with both line numbers.
 *
 * Pi format: removed lines have old line number, added lines have new line
 * number, context lines have old line number. We reconstruct the missing
 * number by tracking the offset (newNum - oldNum) which only changes at
 * added/removed lines.
 */
export function parsePiDiff(diffText: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let offset = 0; // newNum - oldNum

  for (const raw of diffText.split("\n")) {
    const match = raw.match(/^([+-\s])(\s*\d*)\s(.*)$/);
    if (!match) {
      lines.push({ type: "gap", content: "" });
      continue;
    }
    const [, prefix, numStr, content] = match;
    const num = numStr.trim() ? parseInt(numStr.trim(), 10) : undefined;

    if (prefix === "-") {
      lines.push({ type: "removed", oldNum: num, content });
      offset--;
    } else if (prefix === "+") {
      lines.push({ type: "added", newNum: num, content });
      offset++;
    } else if (
      num === undefined &&
      (content === "..." || content.trim() === "")
    ) {
      // Gap separator: no line number with "..." or blank content
      lines.push({ type: "gap", content: "" });
    } else {
      lines.push({
        type: "context",
        oldNum: num,
        newNum: num !== undefined ? num + offset : undefined,
        content,
      });
    }
  }

  return lines;
}

/**
 * Trim context lines in a parsed diff down to the desired count.
 * The built-in diff uses 4 context lines; we want fewer.
 */
export function trimContext(lines: DiffLine[], contextLines = 1): DiffLine[] {
  const result: DiffLine[] = [];

  // Group lines into sections separated by gaps
  const sections: DiffLine[][] = [[]];
  for (const line of lines) {
    if (line.type === "gap") {
      sections.push([]);
    } else {
      sections[sections.length - 1].push(line);
    }
  }

  for (const section of sections) {
    if (!section.length) continue;

    const firstChange = section.findIndex(
      (l) => l.type === "added" || l.type === "removed",
    );
    const lastChange = section.findLastIndex(
      (l) => l.type === "added" || l.type === "removed",
    );

    if (firstChange === -1) continue; // Pure context section — skip

    const start = Math.max(0, firstChange - contextLines);
    const end = Math.min(section.length, lastChange + contextLines + 1);

    // Gap separator between sections (but not at the very start)
    if (result.length > 0) {
      result.push({ type: "gap", content: "" });
    }

    // Within the kept range, collapse long context runs between changes
    let i = start;
    while (i < end) {
      const line = section[i];
      if (line.type === "context") {
        let runEnd = i + 1;
        while (runEnd < end && section[runEnd].type === "context") runEnd++;

        if (runEnd - i <= contextLines * 2 + 1) {
          for (let j = i; j < runEnd; j++) result.push(section[j]);
        } else {
          for (let j = i; j < i + contextLines; j++) result.push(section[j]);
          result.push({ type: "gap", content: "" });
          for (let j = runEnd - contextLines; j < runEnd; j++)
            result.push(section[j]);
        }
        i = runEnd;
      } else {
        result.push(line);
        i++;
      }
    }
  }

  return normalizeGaps(result);
}

/**
 * Reorder diff lines so additions come before removals in each hunk.
 * (-minus, +plus) and (+plus, -minus) are equivalent operations, but the
 * latter is more useful during streaming: the last + line is the streaming
 * frontier, and having removals after it means the truncation window shows
 * useful added content instead of a wall of deletions.
 */
export function reorderAdditionsFirst(lines: DiffLine[]): DiffLine[] {
  const result: DiffLine[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].type === "removed") {
      // Collect the run of removals
      const removals: DiffLine[] = [];
      while (i < lines.length && lines[i].type === "removed") {
        removals.push(lines[i]);
        i++;
      }
      // Collect any immediately following additions
      const additions: DiffLine[] = [];
      while (i < lines.length && lines[i].type === "added") {
        additions.push(lines[i]);
        i++;
      }
      // Emit additions first, then removals
      result.push(...additions, ...removals);
    } else {
      result.push(lines[i]);
      i++;
    }
  }
  return result;
}

/** Remove line numbers (for preview diffs where numbers are snippet-relative). */
export function stripLineNumbers(lines: DiffLine[]) {
  for (const line of lines) {
    line.oldNum = undefined;
    line.newNum = undefined;
  }
}

// ─── Diff formatting ───────────────────────────────────────────────────────────

/**
 * Format diff lines into the side-by-side line number format:
 *   10 ⋮ 10 │content
 *   11 ⋮    │removed
 *      ⋮ 11 │added
 */
export function formatDiffLines(lines: DiffLine[], theme: Theme): string[] {
  let maxNum = 1;
  for (const line of lines) {
    if (line.oldNum && line.oldNum > maxNum) maxNum = line.oldNum;
    if (line.newNum && line.newNum > maxNum) maxNum = line.newNum;
  }
  const w = String(maxNum).length;
  const blank = " ".repeat(w);

  const result: string[] = [];
  for (const line of lines) {
    if (line.type === "gap") {
      result.push(theme.fg("dim", "..."));
      continue;
    }

    const oldStr =
      line.oldNum !== undefined ? String(line.oldNum).padStart(w) : blank;
    const newStr =
      line.newNum !== undefined ? String(line.newNum).padStart(w) : blank;
    const gutter = `${oldStr} ⋮ ${newStr} │`;

    if (line.type === "removed") {
      result.push(theme.fg("error", gutter + line.content));
    } else if (line.type === "added") {
      result.push(theme.fg("success", gutter + line.content));
    } else {
      result.push(theme.fg("dim", gutter + line.content));
    }
  }

  return result;
}

/**
 * Format plain file content lines (for replay where we can't compute a diff).
 */
export function formatContentLines(content: string, theme: Theme): string[] {
  const lines = content.split("\n");
  const w = String(lines.length).length;
  return lines.map((line, i) => {
    const num = String(i + 1).padStart(w);
    return theme.fg("dim", `${num} │${line}`);
  });
}

// ─── Shared rendering ──────────────────────────────────────────────────────────

/**
 * Render a collapsible block of formatted lines with a summary footer.
 */
export function formatCollapsible(
  formatted: string[],
  summary: string,
  expanded: boolean,
  theme: Theme,
): string {
  if (expanded) {
    return formatted.join("\n") + "\n\n" + summary;
  }
  const skipped = formatted.length - COLLAPSED_MAX_LINES;
  const shown =
    skipped > 0
      ? formatted.slice(formatted.length - COLLAPSED_MAX_LINES)
      : formatted;
  let text = "";
  if (skipped > 0) {
    text +=
      theme.fg("muted", `(${skipped} more lines, ctrl+o to expand)`) + "\n\n";
  }
  text += shown.join("\n");
  text += "\n\n" + summary;
  return text;
}

/**
 * Like formatCollapsible, but centers the window on the streaming frontier:
 * the last added or context line (where new content ends and remaining
 * old-file removals begin).
 */
export function formatCollapsibleAtFrontier(
  formatted: string[],
  diffLines: DiffLine[],
  summary: string,
  expanded: boolean,
  theme: Theme,
): string {
  if (expanded || formatted.length <= COLLAPSED_MAX_LINES) {
    return formatCollapsible(formatted, summary, expanded, theme);
  }

  // Find the last added line — during streaming this is the frontier
  // of new content. Position the window so this line is at the bottom.
  let lastAdded = -1;
  for (let i = diffLines.length - 1; i >= 0; i--) {
    if (diffLines[i].type === "added") {
      lastAdded = i;
      break;
    }
  }
  // Fall back to end of array if no added lines
  const anchor = lastAdded >= 0 ? lastAdded : formatted.length - 1;

  let end = anchor + 1;
  let start = end - COLLAPSED_MAX_LINES;

  // Clamp to bounds
  if (end > formatted.length) {
    end = formatted.length;
    start = end - COLLAPSED_MAX_LINES;
  }
  if (start < 0) {
    start = 0;
    end = Math.min(formatted.length, COLLAPSED_MAX_LINES);
  }

  const shown = formatted.slice(start, end);
  let text = "";
  if (start > 0) {
    text +=
      theme.fg("muted", `(${start} earlier lines, ctrl+o to expand)`) + "\n\n";
  }
  text += shown.join("\n");
  const below = formatted.length - end;
  if (below > 0) {
    text +=
      "\n\n" + theme.fg("muted", `(${below} more lines, ctrl+o to expand)`);
  }
  text += "\n\n" + summary;
  return text;
}

export function diffSummary(lines: DiffLine[], theme: Theme): string {
  let additions = 0;
  let removals = 0;
  for (const line of lines) {
    if (line.type === "added") additions++;
    if (line.type === "removed") removals++;
  }
  return (
    theme.fg("success", `+${additions}`) +
    theme.fg("dim", " / ") +
    theme.fg("error", `-${removals}`) +
    theme.fg("muted", " lines changed")
  );
}

export function renderDiffResult(
  diffLines: DiffLine[],
  expanded: boolean,
  theme: Theme,
): string {
  return formatCollapsibleAtFrontier(
    formatDiffLines(diffLines, theme),
    diffLines,
    diffSummary(diffLines, theme),
    expanded,
    theme,
  );
}

export function renderWrittenContent(
  content: string,
  expanded: boolean,
  theme: Theme,
): string {
  const lines = content.split("\n");
  return formatCollapsible(
    formatContentLines(content, theme),
    theme.fg("dim", `${lines.length} lines written`),
    expanded,
    theme,
  );
}

// ─── Edit tool helpers ─────────────────────────────────────────────────────────

/**
 * Collect diff lines from edit args (single oldText/newText or edits array).
 * Uses || for field checks — during streaming, one side may not have arrived yet.
 */
export function collectEditDiffLines(args: any): DiffLine[] {
  const allLines: DiffLine[] = [];
  if (args.oldText !== undefined || args.newText !== undefined) {
    allLines.push(...computeDiffLines(args.oldText ?? "", args.newText ?? ""));
  } else if (args.edits?.length) {
    for (const edit of args.edits) {
      if (edit.oldText !== undefined || edit.newText !== undefined) {
        if (allLines.length) allLines.push({ type: "gap", content: "" });
        allLines.push(
          ...computeDiffLines(edit.oldText ?? "", edit.newText ?? ""),
        );
      }
    }
  }
  return normalizeGaps(allLines);
}

// ─── Extension entry point ─────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  const cwd = process.cwd();

  // --- Edit tool ---
  const originalEdit = createEditTool(cwd);
  pi.registerTool({
    name: "edit",
    label: "edit",
    description: originalEdit.description,
    parameters: originalEdit.parameters,

    async execute(toolCallId, params, signal, onUpdate) {
      return originalEdit.execute(toolCallId, params, signal, onUpdate);
    },

    renderCall(args, theme, context) {
      let text = theme.fg("toolTitle", theme.bold("edit "));
      text += theme.fg("accent", args.path ?? "");

      // Show mini-diff from args while in-flight (no final result yet).
      // Strip line numbers since they're snippet-relative.
      if (context.isPartial) {
        const allLines = reorderAdditionsFirst(collectEditDiffLines(args));
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

      const details = result.details as EditToolDetails | undefined;
      const content = result.content[0];

      if (content?.type === "text" && content.text.startsWith("Error")) {
        return new Text(theme.fg("error", content.text.split("\n")[0]), 0, 0);
      }

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

      return new Text(
        renderDiffResult(reorderAdditionsFirst(diffLines), expanded, theme),
        0,
        0,
      );
    },
  });

  // --- Write tool ---
  const originalWrite = createWriteTool(cwd);

  interface WriteRenderState {
    oldContent?: string; // undefined = not loaded; '' = new file
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

      // Load old content synchronously on first render (before execute writes).
      // Sync avoids the race condition where async read completes after write.
      if (state.oldContent === undefined && !isReplay && args.path) {
        try {
          state.oldContent = readFileSync(resolve(cwd, args.path), "utf-8");
        } catch {
          state.oldContent = ""; // New file
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
          // Reorder so additions come before removals — during streaming
          // this puts the frontier (last +) before the trailing deletions,
          // making the truncation window show useful content.
          const reordered = reorderAdditionsFirst(diffLines);
          const formatted = formatDiffLines(reordered, theme);
          const summary = diffSummary(reordered, theme);
          text +=
            "\n" +
            formatCollapsibleAtFrontier(
              formatted,
              reordered,
              summary,
              context.expanded,
              theme,
            );
        }
      }

      return new Text(text, 0, 0);
    },

    renderResult(_result, _opts, _theme) {
      // All rendering handled by renderCall; suppress built-in message
      return new Text("", 0, 0);
    },
  });
}
