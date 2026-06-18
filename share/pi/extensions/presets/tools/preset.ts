/**
 * Model Presets — Flag, command, and shortcut registration
 *
 * Provides:
 *   - --preset CLI flag (set model at startup)
 *   - /preset command (mid-session selector)
 *   - alt+p shortcut (cycle through presets)
 *
 * References are strict `<group>/<model>` (e.g. "zai/mid"); bare names like
 * "mid" resolve against the config default group.
 */

import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import type { AppState } from "../state.js";
import type { ResolvedPreset } from "../lib/presets.js";
import {
  clearPresetsCache,
  getAllRefs,
  getDefaultPresetRef,
  nextPreset,
  prevPreset,
  resolvePreset,
} from "../lib/presets.js";

// ─── Flag Registration ─────────────────────────────────────────────────────

export function registerPresetFlags(pi: ExtensionAPI) {
  pi.registerFlag("preset", {
    description:
      "Start with a model preset (group/model, e.g. --preset zai/mid; bare name uses the default group). Must be defined in ~/.pi/agent/presets.json",
    type: "string",
    default: undefined,
  });
  pi.registerFlag("no-preset", {
    description:
      "Do not apply the default preset at startup (used automatically when --model is given without --preset)",
    type: "boolean",
    default: false,
  });
}

// ─── Detect Current Preset ───────────────────────────────────────────────────

/**
 * Detect if the current model matches an existing preset and, if so, mark it
 * active in the state.
 *
 * Primary match is by the current model's provider + id (read from ctx.model).
 * Falls back to thinking-level matching when the model can't be identified or
 * isn't in any preset.
 */
async function detectAndSetCurrentPreset(
  state: AppState,
  pi: ExtensionAPI,
  ctx: ExtensionContext,
): Promise<void> {
  try {
    const refs = await getAllRefs();
    if (refs.length === 0) return;

    const currentModel = ctx.model;
    const currentThinkingLevel = pi.getThinkingLevel?.();

    // Primary: match by provider + model id.
    if (currentModel) {
      for (const candidate of refs) {
        const resolved = await resolvePreset(candidate);
        if (
          resolved &&
          resolved.provider === currentModel.provider &&
          resolved.model === currentModel.id
        ) {
          state.preset.activePresetName = candidate;
          return;
        }
      }
    }

    // Fallback: match by thinking level only.
    for (const candidate of refs) {
      const resolved = await resolvePreset(candidate);
      if (!resolved) continue;
      let thinkingMatch = true;
      if (resolved.thinkingLevel && currentThinkingLevel) {
        thinkingMatch = currentThinkingLevel === resolved.thinkingLevel;
      }
      if (thinkingMatch) {
        state.preset.activePresetName = candidate;
        return;
      }
    }
  } catch (_error) {
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
  const noPreset = pi.getFlag("no-preset") as boolean | undefined;

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
  // --no-preset suppresses the default on startup when --model was given explicitly.
  const presetRef = flagPreset
    ? flagPreset
    : event.reason === "new"
      ? await getDefaultPresetRef()
      : event.reason === "startup" && !hasModelSettings && !noPreset
        ? await getDefaultPresetRef()
        : undefined;

  if (presetRef) {
    // Explicit preset was requested or configured as default
    const preset = await resolvePreset(presetRef);
    if (!preset) {
      ctx.ui.notify(
        `Preset not found: ${presetRef}. Check ~/.pi/agent/presets.json`,
        "warning",
      );
      return;
    }
    await applyPreset(state, pi, ctx, preset);
  } else {
    // No explicit preset - try to detect if current settings match an existing preset
    await detectAndSetCurrentPreset(state, pi, ctx);
  }
}

// ─── Apply Preset ─────────────────────────────────────────────────────────────

async function applyPreset(
  state: AppState,
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  preset: ResolvedPreset,
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
  state.preset.activePresetName = preset.ref;

  ctx.ui.notify(`Preset activated: ${preset.ref}`, "info");
}

// ─── Commands ─────────────────────────────────────────────────────────────────

export function registerPresetCommands(state: AppState, pi: ExtensionAPI) {
  pi.registerCommand("preset", {
    description:
      "Activate a model preset: /preset [group/model] or /preset for selector",
    handler: async (args, ctx: ExtensionCommandContext) => {
      const input = args.trim();

      if (!input) {
        // Interactive selector
        if (!ctx.hasUI) {
          ctx.ui.notify("/preset requires interactive mode", "error");
          return;
        }

        const refs = await getAllRefs();

        if (refs.length === 0) {
          ctx.ui.notify("No presets found in ~/.pi/agent/presets.json", "info");
          return;
        }

        const selected = await ctx.ui.select("Select preset:", refs);

        if (!selected) return;

        const preset = await resolvePreset(selected);
        if (preset) {
          await applyPreset(state, pi, ctx, preset);
        }
      } else {
        // Named preset (bare or qualified)
        const preset = await resolvePreset(input);
        if (!preset) {
          ctx.ui.notify(
            `Preset not found: ${input}. Check ~/.pi/agent/presets.json`,
            "warning",
          );
          return;
        }

        await applyPreset(state, pi, ctx, preset);
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

      await applyPreset(state, pi, ctx, preset);
    },
  });

  pi.registerShortcut("alt+shift+p", {
    description: "Cycle backward through model presets",
    handler: async (ctx) => {
      const prev = await prevPreset(state.preset.activePresetName);
      if (!prev) {
        ctx.ui.notify("No presets configured", "info");
        return;
      }

      const preset = await resolvePreset(prev);
      if (!preset) {
        ctx.ui.notify(`Preset not found: ${prev}`, "warning");
        return;
      }

      await applyPreset(state, pi, ctx, preset);
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
