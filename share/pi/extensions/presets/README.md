# Presets Extension

Model presets and subagents.

## Features

- Model presets
- Subagents

### Model presets

**Problem:** Cycling through models and thinking levels is tedious. I want a single place to define my preferred models and thinking levels, accessible where it's needed.

This feature registers `--preset` and stores `~/.pi/agent/presets.json`. When not otherwise overridden, the default preset is used on startup. `alt+p` cycles through presets. The preset simply adjusts the model and thinking level. Presets are loaded in `resources_discover` and cached.

### Subagents

**Problem:** I want the agent to be able to use a few specific agents that I've defined. These agents use preset model configurations and have customized system prompts. Notably: explore and planner agents.

The feature defines a subagent tool that takes a list of tasks and subagent profiles to use, and runs them in parallel. Subagents are user-level config in `~/.pi/agent/agents`, and define a model preset (see above) and a system prompt to use.

## Commands

- `/preset` can be used to pick a preset.
