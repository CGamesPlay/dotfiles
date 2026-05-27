import { spawn } from "node:child_process";

export interface NrlResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface NrlOpts {
  socket: string;
  cwd: string;
  timeoutMs?: number;
}

export async function nrl(
  sub: string,
  args: string[],
  opts: NrlOpts,
): Promise<NrlResult> {
  return new Promise((resolve) => {
    const child = spawn("nvim-remote-lsp", [sub, ...args], {
      cwd: opts.cwd,
      env: { ...process.env, NVIM: opts.socket },
      stdio: ["ignore", "pipe", "pipe"],
      // New process group so we can signal bash + any grandchild nvim it spawned.
      // Without this, a hung grandchild keeps stderr open and 'close' never fires.
      detached: true,
    });
    child.unref();

    const killGroup = (signal: NodeJS.Signals) => {
      if (child.pid === undefined) return;
      try {
        process.kill(-child.pid, signal);
      } catch {
        // group already gone
      }
    };

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => (stdout += b.toString()));
    child.stderr.on("data", (b) => (stderr += b.toString()));

    let termTimer: NodeJS.Timeout | undefined;
    let killTimer: NodeJS.Timeout | undefined;
    if (opts.timeoutMs) {
      termTimer = setTimeout(() => {
        killGroup("SIGTERM");
        killTimer = setTimeout(() => killGroup("SIGKILL"), 1000);
      }, opts.timeoutMs);
    }

    const clearTimers = () => {
      if (termTimer) clearTimeout(termTimer);
      if (killTimer) clearTimeout(killTimer);
    };

    child.on("close", (code) => {
      clearTimers();
      resolve({ stdout, stderr, code: code ?? -1 });
    });
    child.on("error", () => {
      clearTimers();
      resolve({ stdout, stderr, code: -1 });
    });
  });
}
