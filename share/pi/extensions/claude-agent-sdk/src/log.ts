import { appendFileSync, mkdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

/**
 * File-based logger for runtime diagnostics. Pi runs as a TUI and
 * routinely discards stderr (raw terminal mode would corrupt the
 * rendering if extensions wrote there), so `console.error` lines are
 * effectively invisible. The log file is the only reliable place to
 * surface what the runtime is doing.
 *
 * Resolution order for the log directory:
 *   1. CLAUDE_AGENT_SDK_LOG_DIR (override for tests / debugging sessions)
 *   2. $XDG_STATE_HOME/pi
 *   3. ~/.local/state/pi
 *   4. os.tmpdir()/pi
 *
 * Probing is eager: at module load we try every candidate, record which
 * one (if any) we can write to, and stash the per-candidate failure
 * reasons for inspection via `getLoggerHealth()`. This is the only way
 * to make logger failures visible — the previous lazy / silent-fallback
 * approach made "no log file" indistinguishable from "no events fired"
 * and cost us a debugging round.
 */

export type LoggerHealth = {
  /** Resolved log file path, or undefined if no candidate was writable. */
  path: string | undefined;
  /** Per-candidate result. Failed entries carry the error message. */
  attempts: Array<{ dir: string; ok: boolean; error?: string }>;
  /** Total writes attempted since module load. */
  writes: number;
  /** Count of writes that threw. */
  writeFailures: number;
  /** Most recent write failure, if any. */
  lastWriteError?: string;
};

const health: LoggerHealth = {
  path: undefined,
  attempts: [],
  writes: 0,
  writeFailures: 0,
};

function probeCandidates(): void {
  const override = process.env.CLAUDE_AGENT_SDK_LOG_DIR;
  const xdg = process.env.XDG_STATE_HOME;
  const candidates = [
    override,
    xdg ? join(xdg, "pi") : undefined,
    join(homedir(), ".local", "state", "pi"),
    join(tmpdir(), "pi"),
  ].filter((p): p is string => Boolean(p));
  for (const dir of candidates) {
    try {
      mkdirSync(dir, { recursive: true });
      const filePath = join(dir, "claude-agent-sdk.log");
      // Touch the file with an opening line so we can confirm write
      // permission, not just directory creation.
      appendFileSync(
        filePath,
        `${new Date().toISOString()} logger.open pid=${process.pid}\n`,
      );
      health.path = filePath;
      health.attempts.push({ dir, ok: true });
      return;
    } catch (err) {
      health.attempts.push({
        dir,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

probeCandidates();

export function log(message: string, fields?: Record<string, unknown>): void {
  if (!health.path) return;
  health.writes++;
  const ts = new Date().toISOString();
  let line = `${ts} ${message}`;
  if (fields) {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(fields)) {
      parts.push(`${k}=${formatField(v)}`);
    }
    if (parts.length > 0) line += " " + parts.join(" ");
  }
  try {
    appendFileSync(health.path, line + "\n");
  } catch (err) {
    health.writeFailures++;
    health.lastWriteError = err instanceof Error ? err.message : String(err);
  }
}

function formatField(v: unknown): string {
  if (v === undefined) return "undefined";
  if (v === null) return "null";
  if (typeof v === "string") {
    return v.length > 200 ? JSON.stringify(v.slice(0, 200) + "…") : JSON.stringify(v);
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Error) return JSON.stringify(`${v.name}: ${v.message}`);
  try {
    const s = JSON.stringify(v);
    return s.length > 400 ? JSON.stringify(s.slice(0, 400) + "…") : s;
  } catch {
    return JSON.stringify(String(v));
  }
}

/**
 * Snapshot of logger state. Used by the `debug-claude-agent-sdk` command
 * and the `session_start` notification so logging failures are visible
 * to the user instead of silently disabling diagnostics.
 */
export function getLoggerHealth(): LoggerHealth {
  return {
    path: health.path,
    attempts: health.attempts.map((a) => ({ ...a })),
    writes: health.writes,
    writeFailures: health.writeFailures,
    lastWriteError: health.lastWriteError,
  };
}

/**
 * One-line human-readable summary suitable for a UI toast. Includes the
 * resolved path on success, or every attempted candidate plus its error
 * on failure.
 */
export function describeLoggerHealth(): string {
  if (health.path) {
    return `logging to ${health.path}`;
  }
  const reasons = health.attempts
    .map((a) => `${a.dir}: ${a.error ?? "ok-but-unused"}`)
    .join("; ");
  return `logging DISABLED — no writable directory. Tried: ${reasons || "(none)"}`;
}
