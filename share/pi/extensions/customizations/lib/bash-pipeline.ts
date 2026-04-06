/**
 * Bash Pipeline Logic
 *
 * Pure functions for parsing bash pipelines and injecting `tee` commands
 * to preserve full unfiltered output for recovery when commands time out
 * or output is truncated.
 *
 * No pi-coding-agent dependencies — fully testable in isolation.
 */

import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface Segment {
  text: string;
  startPos: number;
  endPos: number;
}

// ─── Step 2: Quick bail checks ─────────────────────────────────────────────────

export function shouldBail(command: string): boolean {
  if (command.includes("\n")) return true;
  if (command.includes("`")) return true;
  if (command.includes("$(")) return true;
  if (command.includes("${")) return true;
  if (command.includes("<(")) return true;
  if (command.includes(">(")) return true;
  if (command.includes("<<")) return true;
  return false;
}

// ─── Step 3: Position-aware pipeline split ─────────────────────────────────────

export function splitPipeline(command: string): Segment[] | null {
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  let seenPipe = false;

  const pipePositions: number[] = [];

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    const next = i + 1 < command.length ? command[i + 1] : "";

    if (escaped) {
      escaped = false;
      continue;
    }

    // Inside single quotes
    if (inSingle) {
      if (ch === "\\") {
        // Bail on backslash followed by \, ', or " inside single quotes
        if (next === "\\" || next === "'" || next === '"') return null;
      }
      if (ch === "'") {
        inSingle = false;
      }
      continue;
    }

    // Inside double quotes
    if (inDouble) {
      if (ch === "\\") {
        // Bail on backslash followed by \, ', or " inside double quotes
        if (next === "\\" || next === "'" || next === '"') return null;
      }
      if (ch === '"') {
        inDouble = false;
      }
      continue;
    }

    // Outside quotes
    if (ch === "\\") {
      escaped = true;
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      continue;
    }

    if (ch === '"') {
      inDouble = true;
      continue;
    }

    if (ch === "|") {
      if (next === "|") return null; // || logical OR
      if (next === "&") {
        // |& is bash shorthand for 2>&1 |, treat as pipe
        pipePositions.push(i);
        seenPipe = true;
        i++; // skip &
        continue;
      }
      pipePositions.push(i);
      seenPipe = true;
      continue;
    }

    if (ch === "&") {
      if (next === "&") {
        if (seenPipe) return null; // && after pipe → bail
        i++; // skip second &, allowed before first pipe
        continue;
      }
      // lone & (background) after pipe → bail
      if (seenPipe) return null;
      continue;
    }

    if (ch === ";") {
      if (seenPipe) return null; // ; after pipe → bail
      continue;
    }

    if (ch === "(" || ch === ")") {
      return null; // subshells
    }
  }

  // Unmatched quotes
  if (inSingle || inDouble) return null;

  // No pipes found
  if (pipePositions.length === 0) return null;

  // Build segments from pipe positions
  const segments: Segment[] = [];

  // First segment: from start to first pipe
  const firstPipePos = pipePositions[0];
  segments.push({
    text: command.slice(0, firstPipePos).trim(),
    startPos: 0,
    endPos: firstPipePos,
  });

  // Middle segments: between consecutive pipes
  for (let i = 0; i < pipePositions.length; i++) {
    const pipePos = pipePositions[i];
    // Account for |& being two characters
    const afterPipe =
      pipePos + 1 < command.length && command[pipePos + 1] === "&"
        ? pipePos + 2
        : pipePos + 1;
    const nextPipePos =
      i + 1 < pipePositions.length ? pipePositions[i + 1] : command.length;

    segments.push({
      text: command.slice(afterPipe, nextPipePos).trim(),
      startPos: afterPipe,
      endPos: nextPipePos,
    });
  }

  return segments;
}

// ─── Step 4: Tokenize a segment into args ──────────────────────────────────────

export interface Token {
  value: string;
  quoted: boolean; // true if any part of the token was quoted or escaped
}

export function tokenizeArgs(text: string): Token[] {
  const tokens: Token[] = [];
  let current = "";
  let quoted = false;
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }

    if (inSingle) {
      if (ch === "'") {
        inSingle = false;
      } else {
        current += ch;
      }
      continue;
    }

    if (inDouble) {
      if (ch === '"') {
        inDouble = false;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === "\\") {
      escaped = true;
      quoted = true;
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      quoted = true;
      continue;
    }

    if (ch === '"') {
      inDouble = true;
      quoted = true;
      continue;
    }

    if (ch === " " || ch === "\t") {
      if (current.length > 0) {
        tokens.push({ value: current, quoted });
        current = "";
        quoted = false;
      }
      continue;
    }

    current += ch;
  }

  if (current.length > 0) {
    tokens.push({ value: current, quoted });
  }

  return tokens;
}

// ─── Step 5: Classify a segment ────────────────────────────────────────────────

// Flags that grep accepts without a value argument
const GREP_NO_VALUE_FLAGS = new Set([
  "-v",
  "-i",
  "-E",
  "-P",
  "-F",
  "-w",
  "-x",
  "-c",
  "-n",
  "-l",
  "-L",
  "-q",
  "-o",
  "-H",
  "-h",
  "--line-buffered",
  "--color",
  "--color=always",
  "--color=never",
  "--color=auto",
]);

// Flags that grep accepts WITH a value argument (next token)
const GREP_VALUE_FLAGS = new Set(["-e", "-A", "-B", "-C", "-m"]);

function classifyGrep(tokens: Token[]): "mutatable" | "other" {
  // tokens[0] is "grep"
  let nonFlagCount = 0;
  let i = 1;
  while (i < tokens.length) {
    const arg = tokens[i].value;

    // Check for combined short flags like -viE (but not value flags)
    if (
      arg.startsWith("-") &&
      !arg.startsWith("--") &&
      arg.length > 2 &&
      !GREP_VALUE_FLAGS.has(arg.slice(0, 2))
    ) {
      // Combined flags like -viE: check each character
      const chars = arg.slice(1);
      let allKnown = true;
      for (const c of chars) {
        if (!GREP_NO_VALUE_FLAGS.has(`-${c}`)) {
          allKnown = false;
          break;
        }
      }
      if (!allKnown) return "other"; // unknown flag
      i++;
      continue;
    }

    if (GREP_NO_VALUE_FLAGS.has(arg)) {
      i++;
      continue;
    }

    // --color=xxx variants not in the set
    if (arg.startsWith("--color=")) {
      i++;
      continue;
    }

    if (GREP_VALUE_FLAGS.has(arg)) {
      i += 2; // skip flag and its value
      continue;
    }

    // Value flags with attached value like -A5, -e'pattern'
    if (
      arg.length > 2 &&
      arg.startsWith("-") &&
      !arg.startsWith("--") &&
      GREP_VALUE_FLAGS.has(arg.slice(0, 2))
    ) {
      i++;
      continue;
    }

    // It's a non-flag argument (pattern or filename)
    nonFlagCount++;
    if (nonFlagCount > 1) return "other"; // second non-flag = filename
    i++;
  }

  // Need at least the pattern (unless -e was used)
  return "mutatable";
}

// Tail flags: -N (e.g. -5), -n N, -n +N, --lines=N, --lines=+N
function classifyTail(tokens: Token[]): "mutatable" | "other" {
  let i = 1;
  while (i < tokens.length) {
    const arg = tokens[i].value;

    // -N form (e.g. -5, -100)
    if (/^-\d+$/.test(arg)) {
      i++;
      continue;
    }

    // -n N or -n +N
    if (arg === "-n") {
      i += 2; // skip flag and value
      continue;
    }

    // -nN or -n+N (attached)
    if (/^-n[+]?\d+$/.test(arg)) {
      i++;
      continue;
    }

    // --lines=N or --lines=+N
    if (/^--lines=[+]?\d+$/.test(arg)) {
      i++;
      continue;
    }

    // Any other flag or non-flag argument (especially -f) → not safe
    return "other";
  }

  return "mutatable";
}

// Check if an unquoted token represents an output redirect (not fd duplication).
// Allow fd duplication patterns: >&N, N>&M (e.g. 2>&1, >&2)
function isOutputRedirect(token: Token): boolean {
  if (token.quoted) return false;
  const match = token.value.match(/(\d?)>(>?)(&?\d?)$/);
  if (!match) return false;
  const [, , doubleGt, ampDigit] = match;
  // >>&... isn't valid fd dup, always a redirect
  if (doubleGt === ">") return true;
  // >&N is fd duplication, not a file redirect
  if (ampDigit.startsWith("&")) return false;
  // Plain > or N> without &digit → file redirect
  return true;
}

export function classifySegment(
  segmentText: string,
): "mutatable" | "abort" | "other" {
  const tokens = tokenizeArgs(segmentText);
  if (tokens.length === 0) return "other";

  // Check for output redirection in unquoted tokens
  if (tokens.some(isOutputRedirect)) return "abort";

  const cmd = tokens[0].value;

  // Strip any path prefix to get the base command name
  const baseName = cmd.includes("/") ? cmd.split("/").pop()! : cmd;

  if (baseName === "tee") return "abort";
  if (baseName === "head") return "abort";

  if (baseName === "grep" || baseName === "egrep" || baseName === "fgrep") {
    return classifyGrep(tokens);
  }
  if (baseName === "tail") {
    return classifyTail(tokens);
  }

  return "other";
}

// ─── Step 6: Inject tee ───────────────────────────────────────────────────────

export function injectTee(
  command: string,
): { modified: string; teePath: string } | null {
  if (shouldBail(command)) return null;

  const segments = splitPipeline(command);
  if (!segments || segments.length < 2) return null;

  // Scan backwards from last segment to find mutatable chain
  let firstMutatableIndex = -1;
  let dataSourceBoundary = -1;

  for (let i = segments.length - 1; i >= 0; i--) {
    const classification = classifySegment(segments[i].text);

    if (classification === "abort") return null;
    if (classification === "mutatable") {
      firstMutatableIndex = i;
      continue;
    }
    // "other" → this is the data source boundary
    dataSourceBoundary = i;
    break;
  }

  // No mutatable segments found
  if (firstMutatableIndex === -1) return null;

  // Generate temp file path
  const id = randomBytes(8).toString("hex");
  const teePath = join(tmpdir(), `pi-bash-tee-${id}.log`);

  // Determine injection point:
  // Insert tee between the data source segment and the first mutatable segment.
  // The injection point is the pipe that separates them.
  // If all segments are mutatable (dataSourceBoundary === -1), the first segment
  // (index 0) is the data source, so we inject after segment 0 (before segment 1).
  // Otherwise, inject after the dataSourceBoundary segment.
  const injectAfterSegmentIndex =
    dataSourceBoundary === -1 ? 0 : dataSourceBoundary;

  // The tee insertion point is right after the pipe that follows injectAfterSegmentIndex.
  // segments[injectAfterSegmentIndex + 1].startPos is where the next segment text starts.
  // We insert " tee <path> |" before that segment's text.
  const nextSegment = segments[injectAfterSegmentIndex + 1];

  // Find where the text actually starts (skip whitespace after the pipe)
  const insertPos = nextSegment.startPos;

  // Find the whitespace between pipe and segment text
  let wsEnd = insertPos;
  while (
    wsEnd < command.length &&
    (command[wsEnd] === " " || command[wsEnd] === "\t")
  ) {
    wsEnd++;
  }

  // Reconstruct: everything up to the whitespace after pipe, then tee, then the rest
  const before = command.slice(0, insertPos);
  const after = command.slice(insertPos);

  // Preserve original spacing: if there was a space after pipe, use same pattern
  const modified = `${before} tee ${teePath} |${after}`;

  return { modified, teePath };
}

// ─── Step 9: Format size ──────────────────────────────────────────────────────

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GiB`;
}
