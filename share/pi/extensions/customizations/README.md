# Amalgamated Extension

This extension contains all of my customizations to pi, which cannot be separated into finer extensions because the behaviors interact.

## Features

- Session storage
- Model presets
- Bash tool enhancement
- System assistant mode
- Subagents
- Planning mode

### Session storage

This feature is the building block for other features in this extension. It designates a directory (`~/.pi/session/$SESSION_ID/`) as a "session storage" directory.

When session navigation is used, the contents of this directory are recreated according to the active session history. Additionally, external modifications are recorded into the session history in agent_before_start and turn_end. Therefore, the contents of this directory **are always in sync with the conversation**. 

The contents of these files are also cached in memory for easy access by other extensions.

### Model presets

**Problem:** Cycling through models and thinking levels is tedious. I want a single place to define my preferred models and thinking levels, accessible where it's needed.

This feature registers `--preset` and stores `~/.pi/agent/presets.json`. When not otherwise overridden, the default preset is used on startup. `alt+p` cycles through presets. The preset simply adjusts the model and thinking level.

### Bash tool enhancement

**Problem:** Agents often run `some_slow_command | grep SOME_SPECIFIC_STRING`. When `some_slow_command` fails for some unexpected reason, the agent has to re-run the slow commnd with different filters, wasting time.

This feature detects `command | grep PATTERN` and similar patterns, and transparently rewrites them to `command | tee tempfile | grep PATTERN`. After the command finishes, if the received output is shorter than the full output, it adds a short note that the unfiltered output was saved to the temporary file. This means that an agent that optimistically filtered output doesn't need to rerun the slow command to diagnose what went wrong. It handles grep and tail, and silently disables itself when the command is too complex to safely inject the tee call. 

### System assistant mode

**Problem:** I want to use the coding assistant to help with a system administration task. This requires running system-level commands and cannot be run in a sandbox.

This feature is additionally gated on a command-line `--system-assistant` mode. In this mode, all bash/edit/write calls get an interactive permission prompt.

Additionally, `--completion` adds a new tool `set_command`. When the user accepts the command, pi writes the command to fd 3 and exits. The intended use case is to interactively prepare a single command for the user to execute themselves, bound to a keystroke.

See [@pi](../../../../files/.local/bin/@pi) for the external components.

### Subagents

**Problem:** I want the agent to be able to use a few specific agents that I've defined. These agents use preset model configurations and have customized system problems. Notably: explore and planner agents.

The feature defines a subagent tool that takes a list of tasks and subagent profiles to use, and runs them in parallel. Subagents are user-level config in `~/.pi/agent/agents`, and define a model preset (see above) and a system prompt to use.
