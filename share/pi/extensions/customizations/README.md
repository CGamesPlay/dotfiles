# Amalgamated Extension

This extension contains all of my customizations to pi, which cannot be separated into finer extensions because the behaviors interact.

## Features

- Session storage
- Model presets
- Subagents
- Planning mode

### Session storage

This feature is the building block for other features in this extension. It designates a directory (`~/.pi/session/$SESSION_ID/`) as a "session storage" directory.

When session navigation is used, the contents of this directory are recreated according to the active session history. Additionally, external modifications are recorded into the session history in agent_before_start and turn_end. Therefore, the contents of this directory **are always in sync with the conversation**. 

The contents of these files are also cached in memory for easy access by other extensions.

### Model presets

**Problem:** Cycling through models and thinking levels is tedious. I want a single place to define my preferred models and thinking levels, accessible where it's needed.

This feature registers `--preset` and stores `~/.pi/agent/presets.json`. When not otherwise overridden, the default preset is used on startup. `alt+p` cycles through presets. The preset simply adjusts the model and thinking level.

### Subagents

**Problem:** I want the agent to be able to use a few specific agents that I've defined. These agents use preset model configurations and have customized system problems. Notably: explore and planner agents.

The feature defines a subagent tool that takes a list of tasks and subagent profiles to use, and runs them in parallel. Subagents are user-level config in `~/.pi/agent/agents`, and define a model preset (see above) and a system prompt to use.
