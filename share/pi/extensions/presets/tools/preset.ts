/**
 * Model Presets — Flag, command, and shortcut registration
 *
 * Provides:
 *   - --preset CLI flag (set model at startup)
 *   - /preset command (mid-session selector)
 *   - Ctrl+Shift+U shortcut (cycle through presets)
 */

import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import type { AppState } from "../state.js";
import type { Preset } from "../lib/presets.js";
import {
  clearPresetsCache,
  getDefaultPresetName,
  loadPresets,
  nextPreset,
  resolvePreset,
} from "../lib/presets.js";

// ─── Flag Registration ─────────────────────────────────────────────────────

export function registerPresetFlags(pi: ExtensionAPI) {
  pi.registerFlag("preset", {
    description:
      "Start with a model preset (e.g., --preset small|mid|large). Must be defined in ~/.pi/agent/presets.json",
    type: "string",
    default: undefined,
  });
}

// ─── Detect Current Preset ───────────────────────────────────────────────────

/**
 * Detect if current model and thinking level match an existing preset.
 * If found, sets that preset as active in the state.
 */
async function detectAndSetCurrentPreset(
  state: AppState,
  pi: ExtensionAPI,
): Promise<void> {
  try {
    let currentThinkingLevel = pi.getThinkingLevel?.();
    const presets = await loadPresets();

    // Find a preset that matches current thinking level
    // Note: We can't reliably detect the current model from the registry
    // because the Model object doesn't expose its model/provider properties
    // Instead, we only match based on thinking level when possible

    for (const [name, preset] of Object.entries(presets)) {
      let thinkingMatch = true; // Default to true if no thinking level specified

      // Check thinking level match
      if (preset.thinkingLevel && currentThinkingLevel) {
        thinkingMatch = currentThinkingLevel === preset.thinkingLevel;
      } else if (!preset.thinkingLevel) {
        // Preset doesn't specify thinking level - it matches any thinking level
        thinkingMatch = true;
      }

      if (thinkingMatch) {
        state.preset.activePresetName = name;
        break;
      }
    }
  } catch (error) {
    // Silently fail if detection doesn't work
  }
}

// ─── Session Start Handler ────────────────────────────────────────────────────

export async function applyPresetOnStartup(
  state: AppState,
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  event: any,
): Promise<void> {
  const flagPreset = pi.getFlag("preset") as string | undefined;

  // Check if session has stored model/thinking settings
  const entries = ctx.sessionManager.getEntries();
  const hasModelSettings = entries.some(
    (e: { type: string }) =>
      e.type === "model_change" || e.type === "thinking_level_change",
  );

  // --preset flag and .default apply on:
  //   - initial program startup (pi) with no existing model settings
  //   - new sessions (/new)
  // Never on resume/fork/reload to avoid overwriting stored session state.
  const presetName = flagPreset
    ? flagPreset
    : event.reason === "new"
      ? await getDefaultPresetName()
      : event.reason === "startup" && !hasModelSettings
        ? await getDefaultPresetName()
        : undefined;

  if (presetName) {
    // Explicit preset was requested or configured as default
    const preset = await resolvePreset(presetName);
    if (!preset) {
      ctx.ui.notify(
        `Preset not found: ${presetName}. Check ~/.pi/agent/presets.json`,
        "warning",
      );
      return;
    }
    await applyPreset(state, pi, ctx, preset, presetName);
  } else {
    // No explicit preset - try to detect if current settings match an existing preset
    await detectAndSetCurrentPreset(state, pi);
  }
}

// ─── Apply Preset ─────────────────────────────────────────────────────────────

async function applyPreset(
  state: AppState,
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  preset: Preset,
  presetName: string,
): Promise<void> {
  // Find the model via model registry
  const model = ctx.modelRegistry.find(preset.provider, preset.model);
  if (!model) {
    ctx.ui.notify(
      `Preset model not found: ${preset.provider}/${preset.model}`,
      "error",
    );
    return;
  }

  // Set model
  const modelSet = await pi.setModel(model);
  if (!modelSet) {
    ctx.ui.notify(
      `No API key for preset model: ${preset.provider}/${preset.model}`,
      "error",
    );
    return;
  }

  // Set thinking level
  if (preset.thinkingLevel) {
    pi.setThinkingLevel(preset.thinkingLevel);
  }

  // Update state
  state.preset.activePresetName = presetName;

  ctx.ui.notify(`Preset activated: ${presetName}`, "info");
}

// ─── Commands ─────────────────────────────────────────────────────────────────

export function registerPresetCommands(state: AppState, pi: ExtensionAPI) {
  pi.registerCommand("preset", {
    description:
      "Activate a model preset: /preset [name] or /preset for selector",
    handler: async (args, ctx: ExtensionCommandContext) => {
      const presetName = args.trim();

      if (!presetName) {
        // Interactive selector
        if (!ctx.hasUI) {
          ctx.ui.notify("/preset requires interactive mode", "error");
          return;
        }

        const presets = await loadPresets();
        const presetNames = Object.keys(presets).sort();

        if (presetNames.length === 0) {
          ctx.ui.notify("No presets found in ~/.pi/agent/presets.json", "info");
          return;
        }

        const selected = await ctx.ui.select("Select preset:", presetNames);

        if (!selected) return;

        const preset = presets[selected];
        if (preset) {
          await applyPreset(state, pi, ctx, preset, selected);
        }
      } else {
        // Named preset
        const preset = await resolvePreset(presetName);
        if (!preset) {
          ctx.ui.notify(
            `Preset not found: ${presetName}. Check ~/.pi/agent/presets.json`,
            "warning",
          );
          return;
        }

        await applyPreset(state, pi, ctx, preset, presetName);
      }
    },
  });
}

// ─── Shortcuts ────────────────────────────────────────────────────────────────

export function registerPresetShortcuts(state: AppState, pi: ExtensionAPI) {
  pi.registerShortcut("alt+p", {
    description: "Cycle through model presets",
    handler: async (ctx) => {
      const next = await nextPreset(state.preset.activePresetName);
      if (!next) {
        ctx.ui.notify("No presets configured", "info");
        return;
      }

      const preset = await resolvePreset(next);
      if (!preset) {
        ctx.ui.notify(`Preset not found: ${next}`, "warning");
        return;
      }

      await applyPreset(state, pi, ctx, preset, next);
    },
  });
}

// ─── Main Registration Function ────────────────────────────────────────────────

export function registerPresetFeatures(state: AppState, pi: ExtensionAPI) {
  // Register flag
  registerPresetFlags(pi);

  // Register command
  registerPresetCommands(state, pi);

  // Register shortcut
  registerPresetShortcuts(state, pi);

  // Apply preset on session start if --preset flag is set
  pi.on("session_start", async (e, ctx) => {
    await applyPresetOnStartup(state, pi, ctx, e);
  });

  // Clear cache on reload to pick up new presets.json
  pi.on("session_shutdown", async () => {
    clearPresetsCache();
  });
}
