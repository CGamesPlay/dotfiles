import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import { glob } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

export type SessionMode = "shared" | "self-managed" | "failed";

export interface NvimSession {
  socket: string;
  mode: SessionMode;
  process?: ChildProcess;
}

export interface DiscoverResult {
  session: NvimSession | null;
  log: string[];
}

const ENV_VAR_RE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g;

export function expandEnv(
  pattern: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return pattern.replace(
    ENV_VAR_RE,
    (_match, braced, bare) => env[braced ?? bare] ?? "",
  );
}

function getCwdViaSocket(
  socket: string,
  timeoutMs = 1000,
): { ok: true; cwd: string } | { ok: false; reason: string } {
  const r = spawnSync(
    "nvim",
    ["--headless", "--server", socket, "--remote-expr", "getcwd()"],
    {
      encoding: "utf8",
      timeout: timeoutMs,
    },
  );
  if (r.error) return { ok: false, reason: `getcwd error: ${r.error.message}` };
  if (r.status !== 0)
    return { ok: false, reason: `getcwd exit ${r.status}: ${r.stderr.trim()}` };
  return { ok: true, cwd: r.stdout.trim() };
}

export async function discoverSocket(
  cwd: string,
  patterns: string[],
): Promise<{ socket: string | null; log: string[] }> {
  const log: string[] = [];
  const seen = new Set<string>();

  for (const raw of patterns) {
    const expanded = expandEnv(raw);
    log.push(`pattern ${raw} → ${expanded}`);
    let matched = 0;

    try {
      for await (const entry of glob(expanded) as AsyncIterable<string>) {
        const p = entry;
        matched++;
        if (seen.has(p)) continue;
        seen.add(p);

        let st: fs.Stats;
        try {
          st = fs.statSync(p);
        } catch (err) {
          log.push(`  rejected ${p}: stat failed (${(err as Error).message})`);
          continue;
        }
        if (!st.isSocket()) {
          log.push(`  rejected ${p}: not a socket`);
          continue;
        }

        const r = getCwdViaSocket(p);
        if (!r.ok) {
          log.push(`  rejected ${p}: ${r.reason}`);
          continue;
        }
        if (r.cwd !== cwd) {
          log.push(`  rejected ${p}: cwd=${r.cwd} wanted=${cwd}`);
          continue;
        }

        log.push(`  accepted ${p}`);
        return { socket: p, log };
      }
    } catch (err) {
      log.push(`  glob error: ${(err as Error).message}`);
      continue;
    }

    if (matched === 0) log.push(`  pattern matched 0 paths`);
  }

  return { socket: null, log };
}

export async function spawnSelfManaged(
  cwd: string,
): Promise<{ session: NvimSession; log: string[] }> {
  const log: string[] = [];
  const socket = path.join(
    os.tmpdir(),
    `pi-nvim-remote-lsp.${process.pid}.${Math.random().toString(36).slice(2, 8)}.sock`,
  );
  log.push(`spawning self-managed nvim at ${socket}`);

  const child = spawn("nvim", ["--headless", "--embed", "--listen", socket], {
    cwd,
    stdio: ["pipe", "ignore", "ignore"],
    detached: false,
  });

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (fs.existsSync(socket)) {
      const r = getCwdViaSocket(socket, 500);
      if (r.ok) {
        log.push(`  ready (cwd=${r.cwd})`);
        return {
          session: { socket, mode: "self-managed", process: child },
          log,
        };
      }
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  log.push(`  failed to come up within 5s`);
  child.kill("SIGTERM");
  return { session: { socket, mode: "failed", process: child }, log };
}

export function killSession(session: NvimSession | null): void {
  if (!session?.process) return;
  try {
    session.process.kill("SIGTERM");
  } catch {
    // already dead
  }
  try {
    fs.unlinkSync(session.socket);
  } catch {
    // already gone
  }
}
