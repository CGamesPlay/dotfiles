/**
 * nvim-remote-lsp pi extension.
 *
 * Connects pi to a running nvim's LSP via the `nvim-remote-lsp` CLI:
 *   - on read: announce attached LSPs once per server
 *   - on write/edit: notify nvim that the file changed
 *   - on agent_end: surface diagnostic deltas back to the model
 *   - manages the nvim socket (shared or self-spawned)
 *   - bundles a skill describing the workflow
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { extractBashReadPath } from "./bash-read.js";
import { nrl } from "./nrl.js";
import {
  discoverSocket,
  isSocketAlive,
  killSession,
  spawnSelfManaged,
  type NvimSession,
} from "./nvim-session.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_PATH = path.join(os.homedir(), ".pi", "agent", "settings.json");
const SETTINGS_NAMESPACE = "nvim-remote-lsp";
const STATUS_KEY = "90-nvim";
const HINT_CUSTOM_TYPE = "nvim-remote-lsp-hint";
const HINT_MESSAGE =
  "LSP servers are available for this project; use the nvim-remote-lsp skill to begin. (Automatically generated message; disregard if not relevant)";
const DIAGNOSTICS_MAX_LINES = 10;
const DEFAULT_SOCKET_PATTERNS = ["$TMPDIR/nvim.*"];

interface NvimRemoteLspSettings {
  socketPatterns?: string[];
}

function readSocketPatterns(): string[] {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    const ns = parsed?.[SETTINGS_NAMESPACE] as
      | NvimRemoteLspSettings
      | undefined;
    const p = ns?.socketPatterns;
    if (
      Array.isArray(p) &&
      p.every((x) => typeof x === "string") &&
      p.length > 0
    )
      return p;
  } catch {
    // fall through to default
  }
  return DEFAULT_SOCKET_PATTERNS;
}

export default function (pi: ExtensionAPI) {
  let session: NvimSession | null = null;
  let hintInjected = false;
  let lastDiagnostics = "";
  let hasEdits = false;
  let setStatusFn: ((key: string, text: string | undefined) => void) | null =
    null;

  function armHintFromSession(ctx: {
    sessionManager: {
      getBranch(): Array<{ type: string; customType?: string }>;
    };
  }): void {
    const entries = ctx.sessionManager.getBranch();
    hintInjected = entries.some(
      (e) => e.type === "custom_message" && e.customType === HINT_CUSTOM_TYPE,
    );
  }

  function updateStatus(): void {
    if (!setStatusFn) return;
    if (!session) {
      setStatusFn(STATUS_KEY, "nvim: ✗");
      return;
    }
    if (session.mode === "shared") setStatusFn(STATUS_KEY, "nvim: shared");
    else if (session.mode === "self-managed")
      setStatusFn(STATUS_KEY, "nvim: self-managed");
    else setStatusFn(STATUS_KEY, "nvim: ✗");
  }

  async function rediscover(
    cwd: string,
  ): Promise<{ session: NvimSession; log: string[] }> {
    const log: string[] = [];
    // If NVIM is set (e.g. inherited from a parent pi session), use it
    // unconditionally — skip the cwd check so subagents always share the
    // parent's nvim regardless of working directory.
    if (process.env.NVIM) {
      log.push(`checking inherited NVIM socket: ${process.env.NVIM}`);
      if (isSocketAlive(process.env.NVIM)) {
        log.push(`  accepted (alive)`);
        return { session: { socket: process.env.NVIM, mode: "shared" }, log };
      }
      log.push(`  rejected (not responding)`);
    }
    const patterns = readSocketPatterns();
    log.push(`socket patterns: ${JSON.stringify(patterns)}`);
    const { socket, log: discoverLog } = await discoverSocket(cwd, patterns);
    log.push(...discoverLog);

    if (socket) {
      process.env.NVIM = socket;
      return { session: { socket, mode: "shared" }, log };
    }

    log.push("no shared socket matched cwd; spawning self-managed nvim");
    const { session: spawned, log: spawnLog } = await spawnSelfManaged(cwd);
    log.push(...spawnLog);
    if (spawned.socket) {
      process.env.NVIM = spawned.socket;
    }
    return { session: spawned, log };
  }

  pi.on("resources_discover", async () => {
    return { skillPaths: [path.join(__dirname, "skills")] };
  });

  pi.on("session_start", async (_event, ctx) => {
    setStatusFn =
      ctx.hasUI && ctx.ui.setStatus ? ctx.ui.setStatus.bind(ctx.ui) : null;
    lastDiagnostics = "";
    armHintFromSession(ctx);

    const { session: next } = await rediscover(ctx.cwd);
    session = next;
    updateStatus();
  });

  pi.on("session_tree", async (_event, ctx) => {
    armHintFromSession(ctx);
    updateStatus();
  });

  pi.on("session_compact", async (_event, ctx) => {
    armHintFromSession(ctx);
  });

  pi.on("session_shutdown", async () => {
    killSession(session);
    session = null;
    delete process.env.NVIM;
    setStatusFn?.(STATUS_KEY, undefined);
  });

  pi.on("turn_end", async () => {
    updateStatus();
  });

  async function tryLoadAndHint(abs: string, cwd: string): Promise<void> {
    const loadResult = await nrl("load", [abs], {
      socket: session!.socket,
      cwd,
      timeoutMs: 5000,
    });
    if (loadResult.stdout.trim() !== "true") return;

    hintInjected = true;
    pi.sendMessage(
      { customType: HINT_CUSTOM_TYPE, content: HINT_MESSAGE, display: true },
      { triggerTurn: false, deliverAs: "steer" },
    );
  }

  pi.on("tool_result", async (event, ctx) => {
    if (!session || session.mode === "failed") return;

    if (event.toolName === "read") {
      if (hintInjected) return;
      const filePath =
        typeof event.input.path === "string" ? event.input.path : undefined;
      if (!filePath) return;
      await tryLoadAndHint(path.resolve(ctx.cwd, filePath), ctx.cwd);
      return;
    }

    if (event.toolName === "bash") {
      if (hintInjected) return;
      const command =
        typeof event.input.command === "string"
          ? event.input.command
          : undefined;
      if (!command) return;
      const abs = extractBashReadPath(command, ctx.cwd);
      if (!abs) return;
      await tryLoadAndHint(abs, ctx.cwd);
      return;
    }

    if (event.toolName === "write" || event.toolName === "edit") {
      const filePath =
        typeof event.input.path === "string" ? event.input.path : undefined;
      if (!filePath) return;
      const abs = path.resolve(ctx.cwd, filePath);
      const cwdPrefix = ctx.cwd.endsWith(path.sep) ? ctx.cwd : ctx.cwd + path.sep;
      if (!abs.startsWith(cwdPrefix)) return;
      void nrl("notify-file-changed", [abs], {
        socket: session.socket,
        cwd: ctx.cwd,
        timeoutMs: 3000,
      });
      hasEdits = true;
      return;
    }
  });

  function agentWasAborted(event: { messages?: unknown }): boolean {
    const messages = Array.isArray(event.messages) ? event.messages : [];
    return messages.some(
      (m) =>
        m &&
        typeof m === "object" &&
        (m as { role?: string }).role === "assistant" &&
        ((m as { stopReason?: string }).stopReason === "aborted" ||
          (m as { stopReason?: string }).stopReason === "error"),
    );
  }

  pi.on("agent_end", async (event, ctx) => {
    if (!session || session.mode === "failed") return;
    if (agentWasAborted(event)) return;
    if (!ctx.isIdle() || ctx.hasPendingMessages()) return;
    if (!hasEdits) return;

    const result = await nrl("diagnostics", [], {
      socket: session.socket,
      cwd: ctx.cwd,
      timeoutMs: 35000,
    });
    const output = result.stdout.trim();
    if (!output || output === lastDiagnostics) {
      hasEdits = false;
      return;
    }
    lastDiagnostics = output;

    const lines = output.split("\n");
    const body =
      lines.length > DIAGNOSTICS_MAX_LINES
        ? `${lines.slice(0, DIAGNOSTICS_MAX_LINES).join("\n")}\n... (truncated. Run \`nvim-remote-lsp diagnostics\` for full output.)`
        : output;

    pi.sendMessage(
      {
        customType: "nvim-remote-lsp-diagnostics",
        content: `LSP has updated project diagnostics. This is an automatically generated message.\n\n${body}`,
        display: true,
      },
      {
        triggerTurn: true,
        deliverAs: "steer",
      },
    );
    hasEdits = false;
  });

  pi.registerCommand("nvim-reconnect", {
    description:
      "Re-scan nvim sockets and reconnect (replaces self-managed nvim if a shared one is found).",
    handler: async (_args, ctx) => {
      const { session: next, log } = await rediscover(ctx.cwd);
      if (next.mode === "shared" && session?.mode === "self-managed") {
        killSession(session);
      } else if (next.mode !== "shared" && session) {
        // Keep the old session if rediscovery failed to find shared
        // and we already had something running.
        if (session.mode === "shared" || session.mode === "self-managed") {
          if (next.mode === "failed") {
            log.push("rediscovery failed; keeping existing session");
            if (ctx.hasUI) ctx.ui.notify(log.join("\n"), "warning");
            return;
          }
        }
      }
      session = next;
      updateStatus();
      if (ctx.hasUI) ctx.ui.notify(log.join("\n"), "info");
    },
  });
}
