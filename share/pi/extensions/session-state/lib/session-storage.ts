/**
 * Session Storage — Replay-based file materialization
 *
 * Designates `cwd/.pi/session/` as a session-scoped file directory.
 * Files are materialized by replaying Write/Edit tool calls from the
 * current session branch, making them automatically consistent with
 * the conversation state during navigation, branching, forking, etc.
 *
 * External modifications are detected by comparing inode/mtime/content
 * and recorded as custom session entries so they survive resync.
 */

import {
  mkdir,
  readdir,
  readFile,
  rm,
  rmdir,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
  SessionEntry,
} from "@mariozechner/pi-coding-agent";
import type { ToolCall } from "@mariozechner/pi-ai";
import type { AppState } from "../state.js";

// ─── Constants ─────────────────────────────────────────────────────────────────

/** Maximum file size for external modification tracking (64 KiB) */
const MAX_FILE_SIZE = 64 * 1024;

/** Custom entry type for external modifications */
const EXTERNAL_MOD_TYPE = "session-storage-external-mod";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SessionStorageOp {
  type: "write" | "edit" | "delete";
  path: string; // absolute path
  // For write:
  content?: string;
  // For single edit:
  oldText?: string;
  newText?: string;
  // For multi edit:
  edits?: Array<{ oldText: string; newText: string }>;
}

interface SessionStorageRestoreData {
  entryId: string;
  path: string;
}

interface ExternalModData {
  path: string; // relative to cwd
  content: string | { base64: string } | null; // string = utf-8, object = base64, null = deletion
}

// ─── Path Resolution ───────────────────────────────────────────────────────────

/**
 * Returns the absolute path to the session storage directory.
 * Defaults to `<session log dir>/<session id>`, overridable via `$PI_SESSION_STORAGE`.
 */
export function resolveSessionStorageDir(ctx: ExtensionContext): string {
  const env = process.env.PI_SESSION_STORAGE;
  if (env && path.isAbsolute(env)) return env;
  const sessionDir = ctx.sessionManager.getSessionDir();
  const sessionId = ctx.sessionManager.getSessionId();
  const base = sessionDir || path.join(ctx.cwd, ".pi", "session");
  return path.join(base, sessionId);
}

/** Checks if an absolute path falls inside the session storage directory */
export function isSessionStoragePath(
  absolutePath: string,
  sessionDir: string,
): boolean {
  const normalized = path.resolve(absolutePath);
  const normalizedDir = path.resolve(sessionDir);
  return (
    normalized.startsWith(normalizedDir + path.sep) ||
    normalized === normalizedDir
  );
}

/**
 * Resolve a tool call's path argument to an absolute path.
 * Paths in session storage are stored relative to the session storage dir
 * (with the `$PI_SESSION_STORAGE/` prefix) or as absolute paths.
 * Legacy paths starting with `.pi/session/` are resolved against cwd.
 */
function resolveToolPath(toolPath: string, cwd: string): string {
  if (path.isAbsolute(toolPath)) return path.resolve(toolPath);
  return path.resolve(cwd, toolPath);
}

/** Decode external mod content to a string */
function decodeExternalModContent(
  content: string | { base64: string },
): string {
  if (typeof content === "string") return content;
  return Buffer.from(content.base64, "base64").toString("utf-8");
}

// ─── Branch Resolution ─────────────────────────────────────────────────────────

/**
 * Resolve a raw branch into an effective branch by following branch_summary entries.
 *
 * When a `branch_summary` entry is encountered, its `fromId` references the leaf
 * of the summarized branch. We replace the parent chain up to (and including) the
 * branch_summary with the full summarized branch from `getBranch(fromId)`.
 * This is applied recursively for nested branch summaries.
 *
 * Compaction entries are left as-is (transparent to session storage).
 */
export function resolveEffectiveBranch(
  rawBranch: SessionEntry[],
  ctx: ExtensionContext,
): SessionEntry[] {
  const result: SessionEntry[] = [];

  for (const entry of rawBranch) {
    if (entry.type === "branch_summary") {
      const summaryEntry = entry as any;
      const fromId: string | undefined = summaryEntry.fromId;
      if (!fromId) continue;

      let summarizedBranch: SessionEntry[];
      try {
        summarizedBranch = ctx.sessionManager.getBranch(fromId);
      } catch {
        continue; // Can't resolve — skip
      }

      // Recursively resolve any branch summaries in the summarized branch
      const effective = resolveEffectiveBranch(summarizedBranch, ctx);

      // Replace everything we've accumulated (shared prefix) with the
      // full summarized branch (shared prefix + unique entries)
      result.length = 0;
      result.push(...effective);
      // Don't push the branch_summary entry itself — continue with
      // entries that come after it in the raw branch
    } else {
      result.push(entry);
    }
  }

  return result;
}

// ─── Branch Walking ────────────────────────────────────────────────────────────

/**
 * Extract session storage operations from a branch.
 *
 * Walks the branch entries (root → leaf), collects Write/Edit tool calls
 * that target paths within the session storage directory, and filters to
 * only those whose corresponding tool result is not an error.
 *
 * Also handles `session-storage-restore` and `session-storage-external-mod`
 * custom entries.
 */
export function extractSessionStorageOps(
  rawBranch: SessionEntry[],
  sessionDir: string,
  cwd: string,
  ctx: ExtensionContext,
): SessionStorageOp[] {
  // Resolve branch summaries to get the effective branch
  const branch = resolveEffectiveBranch(rawBranch, ctx);

  // First pass: collect tool calls and tool results indexed by toolCallId
  const toolCalls = new Map<
    string,
    { name: string; input: Record<string, unknown>; order: number }
  >();
  const toolResults = new Map<string, { isError: boolean }>();

  // Also collect custom entries in order
  const customOps: Array<{ order: number; op: SessionStorageOp }> = [];

  let orderCounter = 0;

  for (const entry of branch) {
    if (entry.type === "message") {
      const msg = (entry as any).message;
      if (!msg) continue;

      if (msg.role === "assistant" && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === "toolCall") {
            const tc = block as ToolCall;
            toolCalls.set(tc.id, {
              name: tc.name,
              input: tc.arguments ?? {},
              order: orderCounter++,
            });
          }
        }
      } else if (msg.role === "toolResult") {
        toolResults.set(msg.toolCallId, {
          isError: msg.isError === true,
        });
      }
    } else if (entry.type === "custom") {
      const custom = entry as any;

      if (custom.customType === "session-storage-restore" && custom.data) {
        const restore = custom.data as SessionStorageRestoreData;
        const absolutePath = resolveToolPath(restore.path, cwd);
        if (!isSessionStoragePath(absolutePath, sessionDir)) {
          orderCounter++;
          continue;
        }

        const content = reconstructFileFromBranch(
          restore.entryId,
          restore.path,
          sessionDir,
          cwd,
          ctx,
        );
        if (content !== null) {
          customOps.push({
            order: orderCounter++,
            op: { type: "write", path: absolutePath, content },
          });
        } else {
          orderCounter++;
        }
      } else if (custom.customType === EXTERNAL_MOD_TYPE && custom.data) {
        const mod = custom.data as ExternalModData;
        const absolutePath = resolveToolPath(mod.path, cwd);
        if (!isSessionStoragePath(absolutePath, sessionDir)) {
          orderCounter++;
          continue;
        }

        if (mod.content === null) {
          customOps.push({
            order: orderCounter++,
            op: { type: "delete", path: absolutePath },
          });
        } else {
          customOps.push({
            order: orderCounter++,
            op: {
              type: "write",
              path: absolutePath,
              content: decodeExternalModContent(mod.content),
            },
          });
        }
      } else {
        orderCounter++;
      }
    }
  }

  // Second pass: build ordered ops from write/edit tool calls that target session storage
  const rawOps: Array<{ order: number; op: SessionStorageOp }> = [];

  for (const [toolCallId, tc] of toolCalls) {
    if (tc.name !== "write" && tc.name !== "edit") continue;

    const result = toolResults.get(toolCallId);
    if (!result || result.isError) continue;

    const toolPath = tc.input.path as string | undefined;
    if (!toolPath) continue;

    const absolutePath = resolveToolPath(toolPath, cwd);
    if (!isSessionStoragePath(absolutePath, sessionDir)) continue;

    if (tc.name === "write") {
      rawOps.push({
        order: tc.order,
        op: {
          type: "write",
          path: absolutePath,
          content: (tc.input.content as string) ?? "",
        },
      });
    } else if (tc.name === "edit") {
      if (tc.input.edits && Array.isArray(tc.input.edits)) {
        rawOps.push({
          order: tc.order,
          op: {
            type: "edit",
            path: absolutePath,
            edits: tc.input.edits as Array<{
              oldText: string;
              newText: string;
            }>,
          },
        });
      } else if (
        typeof tc.input.oldText === "string" &&
        typeof tc.input.newText === "string"
      ) {
        rawOps.push({
          order: tc.order,
          op: {
            type: "edit",
            path: absolutePath,
            oldText: tc.input.oldText,
            newText: tc.input.newText,
          },
        });
      }
    }
  }

  // Merge custom ops and tool ops, sort by order
  const allOps = [...rawOps, ...customOps];
  allOps.sort((a, b) => a.order - b.order);
  return allOps.map(({ op }) => op);
}

/**
 * Reconstruct the final content of a file from a specific branch point.
 */
function reconstructFileFromBranch(
  entryId: string,
  filePath: string,
  sessionDir: string,
  cwd: string,
  ctx: ExtensionContext,
): string | null {
  let referenceBranch: SessionEntry[];
  try {
    referenceBranch = ctx.sessionManager.getBranch(entryId);
  } catch {
    return null;
  }

  if (!referenceBranch || referenceBranch.length === 0) return null;

  // Resolve branch summaries before extracting ops
  const effectiveBranch = resolveEffectiveBranch(referenceBranch, ctx);

  const ops = extractOpsWithoutRestores(
    effectiveBranch,
    sessionDir,
    cwd,
    filePath,
  );

  if (ops.length === 0) return null;

  const fileContents = replayOperations(ops);
  const absolutePath = resolveToolPath(filePath, cwd);
  return fileContents.get(absolutePath) ?? null;
}

/**
 * Extract ops from a branch without processing restore entries.
 * Used by reconstructFileFromBranch to avoid infinite recursion.
 */
function extractOpsWithoutRestores(
  branch: SessionEntry[],
  sessionDir: string,
  cwd: string,
  targetFilePath?: string,
): SessionStorageOp[] {
  const toolCalls = new Map<
    string,
    { name: string; input: Record<string, unknown>; order: number }
  >();
  const toolResults = new Map<string, { isError: boolean }>();
  const customOps: Array<{ order: number; op: SessionStorageOp }> = [];

  let orderCounter = 0;

  for (const entry of branch) {
    if (entry.type === "message") {
      const msg = (entry as any).message;
      if (!msg) continue;

      if (msg.role === "assistant" && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === "toolCall") {
            const tc = block as ToolCall;
            toolCalls.set(tc.id, {
              name: tc.name,
              input: tc.arguments ?? {},
              order: orderCounter++,
            });
          }
        }
      } else if (msg.role === "toolResult") {
        toolResults.set(msg.toolCallId, {
          isError: msg.isError === true,
        });
      }
    } else if (entry.type === "custom") {
      const custom = entry as any;
      if (custom.customType === EXTERNAL_MOD_TYPE && custom.data) {
        const mod = custom.data as ExternalModData;
        const absolutePath = resolveToolPath(mod.path, cwd);
        if (!isSessionStoragePath(absolutePath, sessionDir)) {
          orderCounter++;
          continue;
        }
        if (targetFilePath) {
          const targetAbsolute = resolveToolPath(targetFilePath, cwd);
          if (absolutePath !== targetAbsolute) {
            orderCounter++;
            continue;
          }
        }

        if (mod.content === null) {
          customOps.push({
            order: orderCounter++,
            op: { type: "delete", path: absolutePath },
          });
        } else {
          customOps.push({
            order: orderCounter++,
            op: {
              type: "write",
              path: absolutePath,
              content: decodeExternalModContent(mod.content),
            },
          });
        }
      } else {
        orderCounter++;
      }
    }
  }

  const targetAbsolute = targetFilePath
    ? resolveToolPath(targetFilePath, cwd)
    : undefined;

  const rawOps: Array<{ order: number; op: SessionStorageOp }> = [];

  for (const [toolCallId, tc] of toolCalls) {
    if (tc.name !== "write" && tc.name !== "edit") continue;
    const result = toolResults.get(toolCallId);
    if (!result || result.isError) continue;

    const toolPath = tc.input.path as string | undefined;
    if (!toolPath) continue;

    const absolutePath = resolveToolPath(toolPath, cwd);
    if (!isSessionStoragePath(absolutePath, sessionDir)) continue;
    if (targetAbsolute && absolutePath !== targetAbsolute) continue;

    if (tc.name === "write") {
      rawOps.push({
        order: tc.order,
        op: {
          type: "write",
          path: absolutePath,
          content: (tc.input.content as string) ?? "",
        },
      });
    } else if (tc.name === "edit") {
      if (tc.input.edits && Array.isArray(tc.input.edits)) {
        rawOps.push({
          order: tc.order,
          op: {
            type: "edit",
            path: absolutePath,
            edits: tc.input.edits as Array<{
              oldText: string;
              newText: string;
            }>,
          },
        });
      } else if (
        typeof tc.input.oldText === "string" &&
        typeof tc.input.newText === "string"
      ) {
        rawOps.push({
          order: tc.order,
          op: {
            type: "edit",
            path: absolutePath,
            oldText: tc.input.oldText,
            newText: tc.input.newText,
          },
        });
      }
    }
  }

  const allOps = [...rawOps, ...customOps];
  allOps.sort((a, b) => a.order - b.order);
  return allOps.map(({ op }) => op);
}

// ─── Replay ────────────────────────────────────────────────────────────────────

/**
 * Apply a single edit operation to file content.
 * Uses simple exact string replacement. If oldText is not found,
 * returns content unchanged (skip silently).
 */
export function applyEditToContent(
  content: string,
  op: SessionStorageOp,
): string {
  if (op.edits) {
    let result = content;
    for (const edit of op.edits) {
      const idx = result.indexOf(edit.oldText);
      if (idx !== -1) {
        result =
          result.slice(0, idx) +
          edit.newText +
          result.slice(idx + edit.oldText.length);
      }
    }
    return result;
  }

  if (op.oldText !== undefined && op.newText !== undefined) {
    const idx = content.indexOf(op.oldText);
    if (idx !== -1) {
      return (
        content.slice(0, idx) +
        op.newText +
        content.slice(idx + op.oldText.length)
      );
    }
  }

  return content;
}

/**
 * Replay a sequence of operations to produce the final content of each file.
 * Returns a map of absolute path → final content.
 */
export function replayOperations(ops: SessionStorageOp[]): Map<string, string> {
  const files = new Map<string, string>();

  for (const op of ops) {
    if (op.type === "write") {
      files.set(op.path, op.content ?? "");
    } else if (op.type === "edit") {
      const current = files.get(op.path) ?? "";
      files.set(op.path, applyEditToContent(current, op));
    } else if (op.type === "delete") {
      files.delete(op.path);
    }
  }

  return files;
}

/**
 * Compute the final file state from a session branch without touching the filesystem.
 * Returns a map of absolute path → final content.
 *
 * This is the pure-logic entry point used by tests.
 */
export function computeSessionStorageState(
  branch: SessionEntry[],
  sessionDir: string,
  cwd: string,
  ctx: ExtensionContext,
): Map<string, string> {
  const ops = extractSessionStorageOps(branch, sessionDir, cwd, ctx);
  return replayOperations(ops);
}

// ─── File System Operations ────────────────────────────────────────────────────

/** Ensure the session storage directory exists */
export async function ensureSessionDir(sessionDir: string): Promise<void> {
  await mkdir(sessionDir, { recursive: true });
}

/**
 * Clear all contents of the session storage directory.
 * Does nothing if the directory doesn't exist.
 */
export async function clearSessionDirContents(
  sessionDir: string,
): Promise<void> {
  if (!sessionDir) return;

  let entries: string[];
  try {
    entries = await readdir(sessionDir);
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(sessionDir, entry);
    try {
      await rm(fullPath, { recursive: true, force: true });
    } catch {
      // Best effort
    }
  }
}

/** Remove the session storage directory if it's empty. */
export async function removeSessionDirIfEmpty(
  sessionDir: string,
): Promise<void> {
  if (!sessionDir) return;
  await rmdir(sessionDir).catch(() => {});
}

/**
 * Write file contents to disk, creating parent directories as needed.
 * Returns the set of absolute paths that were materialized.
 */
async function materializeFiles(
  fileContents: Map<string, string>,
): Promise<Set<string>> {
  const materialized = new Set<string>();

  for (const [filePath, content] of fileContents) {
    const dir = path.dirname(filePath);
    await mkdir(dir, { recursive: true });
    await writeFile(filePath, content, "utf-8");
    materialized.add(filePath);
  }

  return materialized;
}

/**
 * Stat all materialized files and populate the tracked files map.
 */
async function snapshotFiles(
  files: Set<string>,
  fileContents: Map<string, string>,
  trackedFiles: Map<string, { content: string; ino: number; mtimeMs: number }>,
): Promise<void> {
  trackedFiles.clear();
  for (const filePath of files) {
    try {
      const s = await stat(filePath);
      trackedFiles.set(filePath, {
        content: fileContents.get(filePath) ?? "",
        ino: s.ino,
        mtimeMs: s.mtimeMs,
      });
    } catch {
      // File may have been removed between materialize and snapshot
    }
  }
}

// ─── External Modification Detection ───────────────────────────────────────────

/**
 * Recursively list all files in a directory, returning absolute paths.
 */
async function listFilesRecursive(dir: string): Promise<string[]> {
  const results: string[] = [];

  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    try {
      const s = await stat(fullPath);
      if (s.isDirectory()) {
        const subFiles = await listFilesRecursive(fullPath);
        results.push(...subFiles);
      } else if (s.isFile()) {
        results.push(fullPath);
      }
    } catch {
      // Entry disappeared between readdir and stat
    }
  }

  return results;
}

/**
 * Detect external modifications to session storage files.
 *
 * Compares the current filesystem state against `state.sessionStorage.trackedFiles`.
 * For each difference (new file, modified content, deleted file), appends a
 * `session-storage-external-mod` custom entry to the session.
 *
 * Uses inode/mtime as a bloom filter: if they match, skip the file.
 * If they differ, read the file and compare content before emitting.
 */
export async function detectExternalModifications(
  state: AppState,
  pi: ExtensionAPI,
  ctx: ExtensionContext,
): Promise<void> {
  const { dir, trackedFiles, pendingInternalWrites } = state.sessionStorage;
  if (!dir) return;

  // Scan filesystem
  const diskFiles = await listFilesRecursive(dir);
  const diskSet = new Set(diskFiles);

  for (const filePath of diskFiles) {
    // Skip files being written by internal tools right now
    if (pendingInternalWrites.has(filePath)) continue;

    const tracked = trackedFiles.get(filePath);

    // Stat the file
    let s: Awaited<ReturnType<typeof stat>>;
    try {
      s = await stat(filePath);
    } catch {
      continue; // Disappeared
    }

    // Check size limit
    if (s.size > MAX_FILE_SIZE) {
      ctx.ui.notify(
        `Session storage: skipping ${path.relative(ctx.cwd, filePath)} (${Math.round(s.size / 1024)} KiB exceeds 64 KiB limit)`,
        "error",
      );
      continue;
    }

    if (tracked && tracked.ino === s.ino && tracked.mtimeMs === s.mtimeMs) {
      // Bloom filter: inode and mtime match, skip
      continue;
    }

    // Read and compare content
    let diskContent: string;
    try {
      const buf = await readFile(filePath);
      diskContent = buf.toString("utf-8");
    } catch {
      continue;
    }

    if (tracked && tracked.content === diskContent) {
      // Content unchanged, just update the snapshot
      trackedFiles.set(filePath, {
        content: diskContent,
        ino: s.ino,
        mtimeMs: s.mtimeMs,
      });
      continue;
    }

    // External modification detected — emit event
    const relativePath = path.relative(ctx.cwd, filePath);

    // Choose encoding: try utf-8 first, fall back to base64 if it round-trips differently
    const roundTripped = Buffer.from(diskContent, "utf-8").toString("utf-8");
    const content: string | { base64: string } =
      roundTripped === diskContent
        ? diskContent
        : { base64: Buffer.from(diskContent, "utf-8").toString("base64") };

    const data: ExternalModData = { path: relativePath, content };
    pi.appendEntry(EXTERNAL_MOD_TYPE, data);

    // Update tracked state
    trackedFiles.set(filePath, {
      content: diskContent,
      ino: s.ino,
      mtimeMs: s.mtimeMs,
    });
  }

  // Check for deletions
  for (const [filePath] of trackedFiles) {
    if (!diskSet.has(filePath) && !pendingInternalWrites.has(filePath)) {
      const relativePath = path.relative(ctx.cwd, filePath);
      const data: ExternalModData = { path: relativePath, content: null };
      pi.appendEntry(EXTERNAL_MOD_TYPE, data);
      trackedFiles.delete(filePath);
    }
  }
}

// ─── Main Entry Point ──────────────────────────────────────────────────────────

/**
 * Full resync of session storage.
 *
 * 1. Resolve and ensure the session storage directory exists
 * 2. Clear all existing files (except .gitignore)
 * 3. Walk the current branch to extract ops targeting session storage
 * 4. Replay ops to reconstruct file contents
 * 5. Materialize files to disk
 * 6. Snapshot file stats for external modification detection
 * 7. Update state
 */
export async function resyncSessionStorage(
  state: AppState,
  ctx: ExtensionContext,
): Promise<void> {
  const sessionDir = resolveSessionStorageDir(ctx);
  state.sessionStorage.dir = sessionDir;

  // Set environment variable for child processes
  process.env.PI_SESSION_STORAGE = sessionDir;

  // Ensure directory exists
  await ensureSessionDir(sessionDir);

  // Clear existing contents
  await clearSessionDirContents(sessionDir);

  // Extract ops from current branch
  const branch = ctx.sessionManager.getBranch();
  const ops = extractSessionStorageOps(branch, sessionDir, ctx.cwd, ctx);

  // Replay to get final file contents
  const fileContents = replayOperations(ops);

  // Materialize to disk
  const materialized = await materializeFiles(fileContents);

  // Snapshot for external modification detection
  await snapshotFiles(
    materialized,
    fileContents,
    state.sessionStorage.trackedFiles,
  );

  // Clear pending writes
  state.sessionStorage.pendingInternalWrites.clear();
}
