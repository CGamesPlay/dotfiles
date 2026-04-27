# System Assistant

**Problem:** I want to use the coding assistant to help with a system administration tasks. This requires running system-level commands and cannot be run in a sandbox.

This extension augments pi with a `--system-assistant` flag. When passed, all bash/write/edit calls get an interactive permission prompt before executing.

Additionally, `--completion` adds a new tool `set_command`. When the user accepts the command, pi writes the command to fd 100 and exits. The intended use case is to interactively prepare a single command for the user to execute themselves, bound to a keystroke.

See [@pi](../../../../files/.local/bin/@pi) for the external components of this integration.

