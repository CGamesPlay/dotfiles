/**
 * Model Presets — Config loading and resolution
 *
 * Reads and caches presets from ~/.pi/agent/presets.json.
 * Each preset specifies a model/provider combination and thinking level.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export interface Preset {
  provider: string;
  model: string;
  thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
}

interface PresetsConfig {
  default?: string;
  presets: Record<string, Preset>;
}

/** Cache for loaded config */
let configCache: PresetsConfig | undefined;

/**
 * Load presets config from ~/.pi/agent/presets.json
 * Returns config with empty .presets if file doesn't exist or can't be parsed.
 * Results are cached after first load.
 */
async function loadConfig(): Promise<PresetsConfig> {
  if (configCache !== undefined) {
    return configCache;
  }

  const presetsPath = path.join(os.homedir(), ".pi", "agent", "presets.json");

  try {
    const content = await readFile(presetsPath, "utf-8");
    const parsed = JSON.parse(content) as PresetsConfig;
    configCache = parsed;
    return configCache;
  } catch (_e) {
    // File not found or parse error — return empty config
    const empty: PresetsConfig = { presets: {} };
    configCache = empty;
    return empty;
  }
}

/**
 * Load presets (the .presets object from config).
 */
export async function loadPresets(): Promise<Record<string, Preset>> {
  const config = await loadConfig();
  return config.presets;
}

/**
 * Get the default preset name (.default from config).
 * Returns undefined if not set.
 */
export async function getDefaultPresetName(): Promise<string | undefined> {
  const config = await loadConfig();
  return config.default;
}

/**
 * Resolve a preset by name.
 * Returns undefined if not found.
 */
export async function resolvePreset(name: string): Promise<Preset | undefined> {
  const presets = await loadPresets();
  return presets[name];
}

/**
 * Get all preset names in sorted order (for cycling).
 */
export async function getPresetNames(): Promise<string[]> {
  const presets = await loadPresets();
  return Object.keys(presets);
}

/**
 * Find the next preset in cycle order.
 * If current is undefined, returns the first preset.
 */
export async function nextPreset(
  current?: string,
): Promise<string | undefined> {
  const names = await getPresetNames();
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
  const names = await getPresetNames();
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
