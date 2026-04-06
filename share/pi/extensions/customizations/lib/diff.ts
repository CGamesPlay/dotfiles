/**
 * Diff Computation & Formatting
 *
 * Pure functions for computing diffs, formatting them with side-by-side
 * line numbers, and rendering collapsible output.
 *
 * Diff format uses side-by-side line numbers:
 *   10 ⋮ 10 │context line
 *   11 ⋮    │removed line        (red)
 *      ⋮ 11 │added line          (green)
 */

import type { Theme } from "@mariozechner/pi-coding-agent";
import * as Diff from "diff";

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
 * Trim excess trailing removed lines during streaming.
 *
 * While the tool call is streaming, the diff tail looks like:
 *   ... additions ...  ← new content written so far
 *   ... removals ...   ← old-file lines not yet replaced
 *
 * We only want to show as many trailing removals as are "unaccounted for"
 * by the additions above them. Algorithm:
 *
 * 1. Walk backwards from the end; count consecutive `+` lines → num_plus.
 * 2. Continue walking backwards; count consecutive `-` lines → num_minus.
 * 3. Keep the first (num_minus - num_plus + 1) minus lines and drop the rest.
 *    e.g. 1 plus + 1 minus → keep 1, drop 0
 *         1 plus + 10 minus → keep 1, drop 9
 *         0 plus + 5 minus → keep 5, drop 0 (no additions yet)
 */
export function trimTrailingRemovals(lines: DiffLine[]): DiffLine[] {
  let i = lines.length - 1;

  // Count trailing + lines
  let numPlus = 0;
  while (i >= 0 && lines[i].type === "added") {
    numPlus++;
    i--;
  }

  // Count the - lines immediately before those + lines
  const minusEnd = i; // index of last - line in the block (if any)
  let numMinus = 0;
  while (i >= 0 && lines[i].type === "removed") {
    numMinus++;
    i--;
  }

  if (numMinus === 0 || numPlus === 0) {
    // Nothing to trim: no trailing removals, or no additions to pair them with
    return lines;
  }

  const keep = Math.min(numMinus, numPlus);
  const drop = numMinus - keep;

  if (drop === 0) {
    return lines;
  }

  // Remove `drop` lines starting right after the keep-th minus line
  // The minus block spans indices [minusEnd - numMinus + 1 .. minusEnd]
  // We keep the first `keep` of those and drop the remaining `drop`.
  const minusStart = minusEnd - numMinus + 1;
  const dropStart = minusStart + keep; // first index to drop
  return [...lines.slice(0, dropStart), ...lines.slice(dropStart + drop)];
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
    theme.fg("muted", " lines")
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
