import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

/**
 * Persisted state recorded on session_shutdown so the next pi process can
 * resume the same SDK session via the SDK's native `resume:` API instead
 * of rebuilding context through buildSyntheticSession.
 *
 * `signatures` is the runtime's lastSignatures at shutdown: signatures for
 * every pi message the SDK transcript reflects, including the most recent
 * assistant turn. On resume we require `signatures` to be a strict prefix
 * of pi's current message signatures — that proves no in-place edit
 * happened between shutdown and resume, anywhere in the history. Messages
 * past `signatures.length` are the tail to replay onto the resumed runtime.
 */
export type SidecarV1 = {
  version: 1;
  sdkSessionId: string;
  signatures: string[];
  sdkUuidByPiIndex?: Array<[number, string]>;
};

const SIDECAR_SUFFIX = ".claude-agent-sdk.json";

/**
 * Sidecar path derived from the pi session JSONL path: same directory,
 * same basename, `.jsonl` replaced with `.claude-agent-sdk.json`.
 */
export function sidecarPathFor(
  piSessionFile: string | undefined,
): string | undefined {
  if (!piSessionFile) return undefined;
  if (piSessionFile.endsWith(".jsonl")) {
    return piSessionFile.slice(0, -".jsonl".length) + SIDECAR_SUFFIX;
  }
  return piSessionFile + SIDECAR_SUFFIX;
}

export async function loadSidecar(
  path: string,
): Promise<SidecarV1 | undefined> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
  const parsed = JSON.parse(raw) as { version?: number } & Partial<SidecarV1>;
  if (parsed.version !== 1) return undefined;
  if (
    typeof parsed.sdkSessionId !== "string" ||
    !Array.isArray(parsed.signatures) ||
    parsed.signatures.some((s) => typeof s !== "string")
  ) {
    return undefined;
  }
  const out: SidecarV1 = {
    version: 1,
    sdkSessionId: parsed.sdkSessionId,
    signatures: parsed.signatures,
  };
  if (parsed.sdkUuidByPiIndex) out.sdkUuidByPiIndex = parsed.sdkUuidByPiIndex;
  return out;
}

/**
 * Atomic write via tmp + rename. A torn write would leave the next process
 * pointing at a half-written sdkSessionId; rename is atomic on the same
 * filesystem.
 */
export async function saveSidecar(
  path: string,
  data: SidecarV1,
): Promise<void> {
  const tmp = `${path}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(data), "utf8");
  await rename(tmp, path);
}

export async function deleteSidecar(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

/**
 * Verify `persisted` is a strict prefix of `current`. Strict here means
 * every persisted signature equals the corresponding current signature,
 * and current has at least as many entries as persisted. When this holds
 * the SDK transcript on disk matches pi's history through the persisted
 * length and pi's tail (indices >= persisted.length) is a pure append.
 */
export function isPrefixOf(persisted: string[], current: string[]): boolean {
  if (persisted.length > current.length) return false;
  for (let i = 0; i < persisted.length; i++) {
    if (persisted[i] !== current[i]) return false;
  }
  return true;
}
