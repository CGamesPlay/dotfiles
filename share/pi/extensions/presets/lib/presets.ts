/**
 * Model Presets — Config loading and resolution
 *
 * Reads and caches presets from ~/.pi/agent/presets.json.
 *
 * Presets are organized into named **groups** (typically one per provider),
 * each group containing named models (size tiers like small/mid/large).
 *
 * References are strict `<group>/<model>` strings (e.g. "zai/mid"). A bare
 * name (e.g. "mid") resolves against a group supplied by the caller, falling
 * back to the group named in `config.default`:
 *
 *   - Main CLI (`--preset`, `/preset`, default): no override → config default
 *     group.
 *   - Subagents: override = the main session's current group (derived from its
 *     live model), so subagents follow the provider the main session is on.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export type ThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export interface Preset {
  provider: string;
  model: string;
  thinkingLevel?: ThinkingLevel;
}

/** A named model inside a group, with its location filled in. */
export interface ResolvedPreset extends Preset {
  /** Size-tier name, e.g. "mid". */
  preset: string;
  /** Group name, e.g. "zai". */
  group: string;
  /** Normalized reference "group/model", e.g. "zai/mid". */
  ref: string;
}

/** group name -> (model name -> preset) */
export type PresetGroups = Record<string, Record<string, Preset>>;

interface PresetsConfig {
  /** Canonical default reference, e.g. "zai/mid". */
  default?: string;
  presets: PresetGroups;
}

// ─── Config loading (with optional base dir for tests) ──────────────────────

/** Cache for loaded config */
let configCache: PresetsConfig | undefined;
/** Override for the base directory (tests). undefined => os.homedir(). */
let baseDirOverride: string | undefined;

/**
 * Set the base directory used to locate `.pi/agent/presets.json`.
 * Intended for tests; invalidates the cache.
 */
export function setPresetsBaseDir(dir?: string): void {
  baseDirOverride = dir;
  configCache = undefined;
}

function presetsPath(): string {
  const base = baseDirOverride ?? os.homedir();
  return path.join(base, ".pi", "agent", "presets.json");
}

/**
 * Load presets config from ~/.pi/agent/presets.json.
 * Returns an empty config if the file doesn't exist or can't be parsed.
 * Results are cached after first load.
 */
async function loadConfig(): Promise<PresetsConfig> {
  if (configCache !== undefined) {
    return configCache;
  }

  try {
    const content = await readFile(presetsPath(), "utf-8");
    const parsed = JSON.parse(content) as Partial<PresetsConfig>;
    configCache = {
      default: parsed.default,
      presets: parsed.presets ?? {},
    };
    return configCache;
  } catch (_e) {
    // File not found or parse error — return empty config
    const empty: PresetsConfig = { presets: {} };
    configCache = empty;
    return empty;
  }
}

// ─── Internal helpers ──────────────────────────────────────────────────────

/** Separator between group and model in a reference (e.g. "zai/mid"). */
const REF_SEP = "/";

/** Resolve a model inside a specific group. Returns undefined if not found. */
function resolveInGroup(
  presetName: string,
  groupName: string,
  groups: PresetGroups,
): ResolvedPreset | undefined {
  const group = groups[groupName];
  if (!group) return undefined;
  const preset = group[presetName];
  if (!preset) return undefined;
  return {
    ...preset,
    preset: presetName,
    group: groupName,
    ref: `${groupName}${REF_SEP}${presetName}`,
  };
}

/** Extract the group from a canonical "group/model" default reference. */
function defaultGroupOf(config: PresetsConfig): string | undefined {
  const def = config.default;
  if (!def) return undefined;
  const parts = def.split(REF_SEP);
  return parts.length === 2 ? parts[0] : undefined;
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Load the grouped presets map (group name -> group).
 */
export async function loadPresets(): Promise<PresetGroups> {
  const config = await loadConfig();
  return config.presets;
}

/**
 * Get the default preset reference (canonical "group/model"), or undefined.
 */
export async function getDefaultPresetRef(): Promise<string | undefined> {
  const config = await loadConfig();
  return config.default;
}

/**
 * Get the default group (the group part of `config.default`), or undefined.
 * Used as the bare-name fallback when no group override is supplied.
 */
export async function getDefaultGroup(): Promise<string | undefined> {
  return defaultGroupOf(await loadConfig());
}

/**
 * Resolve a reference to a preset.
 *
 * - Qualified `<group>/<model>` (exactly 2 tokens, group first): looks up
 *   `<group>` then `<model>` within it. `groupOverride` is ignored.
 * - Bare `<model>` (single token): resolves in `groupOverride`, falling back to
 *   the config default group when no override is given.
 * - Anything else (empty, 3+ tokens): returns undefined.
 *
 * Returns undefined if the group or model is unknown.
 */
export async function resolvePreset(
  ref: string,
  groupOverride?: string,
): Promise<ResolvedPreset | undefined> {
  if (!ref) return undefined;
  const config = await loadConfig();
  const parts = ref.split(REF_SEP);

  if (parts.length === 1) {
    const group = groupOverride ?? defaultGroupOf(config);
    if (!group) return undefined;
    return resolveInGroup(parts[0], group, config.presets);
  }

  if (parts.length === 2) {
    // parts[0] = group, parts[1] = model
    return resolveInGroup(parts[1], parts[0], config.presets);
  }

  return undefined;
}

/**
 * Find which group contains a preset for the given provider + model id.
 * Used to detect the main session's group from its current model.
 * Returns undefined if no preset matches.
 */
export async function findGroupForModel(
  provider: string,
  modelId: string,
): Promise<string | undefined> {
  const groups = await loadPresets();
  for (const [groupName, group] of Object.entries(groups)) {
    for (const preset of Object.values(group)) {
      if (preset.provider === provider && preset.model === modelId) {
        return groupName;
      }
    }
  }
  return undefined;
}

/**
 * Get all preset references in insertion order (groups in JSON order, models
 * in JSON order within each group), as normalized "group/model" strings.
 *
 * Used for both the selector and forward/backward cycling, so the order the
 * user writes presets in is the order they cycle through: e.g.
 * claude/small → claude/mid → claude/large → zai/small → …
 *
 * JSON object key order is preserved, which is why this works without extra
 * metadata.
 */
export async function getAllRefs(): Promise<string[]> {
  const groups = await loadPresets();
  const refs: string[] = [];
  for (const [groupName, group] of Object.entries(groups)) {
    for (const presetName of Object.keys(group)) {
      refs.push(`${groupName}${REF_SEP}${presetName}`);
    }
  }
  return refs;
}

/**
 * Find the next preset in cycle order.
 * If current is undefined, returns the first preset.
 */
export async function nextPreset(
  current?: string,
): Promise<string | undefined> {
  const names = await getAllRefs();
  if (names.length === 0) return undefined;

  if (!current) return names[0];

  const index = names.indexOf(current);
  if (index === -1) return names[0];

  return names[(index + 1) % names.length];
}

/**
 * Find the previous preset in cycle order.
 * If current is undefined, returns the last preset.
 */
export async function prevPreset(
  current?: string,
): Promise<string | undefined> {
  const names = await getAllRefs();
  if (names.length === 0) return undefined;

  if (!current) return names[names.length - 1];

  const index = names.indexOf(current);
  if (index === -1) return names[names.length - 1];

  return names[(index - 1 + names.length) % names.length];
}

/**
 * Clear the cached presets (for testing or reload).
 */
export function clearPresetsCache(): void {
  configCache = undefined;
}
