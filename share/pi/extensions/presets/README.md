# Presets Extension

Model presets and subagents.

## Features

- Model presets
- Subagents

### Model presets

**Problem:** Cycling through models and thinking levels is tedious. I want a single place to define my preferred models and thinking levels, accessible where it's needed.

This feature registers `--preset` and stores `~/.pi/agent/presets.json`. When not otherwise overridden, the default preset is used on startup. `alt+p` cycles forward through presets and `alt+shift+p` cycles backward. The preset simply adjusts the model and thinking level. Presets are loaded in `resources_discover` and cached.

#### Grouped presets

Presets are organized into named **groups** (typically one per provider), each group containing named presets — size tiers like `small`/`mid`/`large`:

```json
{
  "default": "zai/mid",
  "presets": {
    "claude": {
      "small": { "provider": "claude-agent-sdk", "model": "claude-haiku-4-5", "thinkingLevel": "off" },
      "mid":   { "provider": "claude-agent-sdk", "model": "claude-sonnet-4-6", "thinkingLevel": "low" },
      "large": { "provider": "claude-agent-sdk", "model": "claude-opus-4-8", "thinkingLevel": "low" }
    },
    "zai": {
      "small": { "provider": "zai", "model": "glm-4.5-air", "thinkingLevel": "off" },
      "mid":   { "provider": "zai", "model": "glm-4.7", "thinkingLevel": "low" },
      "large": { "provider": "zai", "model": "glm-5.2", "thinkingLevel": "low" }
    }
  }
}
```

#### References

A preset reference is always `<group>/<model>` — the group (provider) first,
the model (size tier) second: `zai/mid` — the `zai` group's `mid` model.

A **bare** name like `mid` (no group) resolves against a group chosen by the
caller, falling back to the group named in `default`:

- The main CLI (`--preset`, `/preset`, and the startup default) resolves bare
  names against the **default group**.
- **Subagents** resolve bare names against the **main session's current group**
  (see below), so a subagent's size tier is fixed while its provider follows the
  session.

### Subagents

**Problem:** I want the agent to be able to use a few specific agents that I've defined. These agents use preset model configurations and have customized system prompts. Notably: explore and planner agents.

The feature defines a subagent tool that takes a list of tasks and subagent profiles to use, and runs them in parallel. Subagents are user-level config in `~/.pi/agent/agents`, and define a model preset and a system prompt to use.

#### Subagent preset follows the session's provider

A subagent's `preset:` frontmatter is usually a bare size tier (e.g. `preset:
small`). Its **group is chosen at invocation time** to match the main session's
current provider, read from the live model. So if the main session is running on
`zai`, every bare-preset subagent runs on `zai` too; switch the session to
`claude` and the subagents switch with it.

To pin a subagent to a specific provider regardless of the session, use a
qualified reference in its frontmatter, e.g. `preset: claude/large`.

## Commands

- `/preset` can be used to pick a preset.
