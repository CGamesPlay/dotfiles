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
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => (stdout += b.toString()));
    child.stderr.on("data", (b) => (stderr += b.toString()));

    const timer = opts.timeoutMs
      ? setTimeout(() => child.kill("SIGTERM"), opts.timeoutMs)
      : undefined;

    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? -1 });
    });
    child.on("error", () => {
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr, code: -1 });
    });
  });
}
