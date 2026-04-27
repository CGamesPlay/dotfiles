# Bash Extension

**Problem:** Agents often run `some_slow_command | grep SOME_SPECIFIC_STRING`. When `some_slow_command` fails for some unexpected reason, the agent has to re-run the slow command with different filters, wasting time.

This extension detects `command | grep PATTERN` and similar patterns, and transparently rewrites them to `command | tee tempfile | grep PATTERN`. After the command finishes, if the received output is shorter than the full output, it adds a short note that the unfiltered output was saved to the temporary file. This means that an agent that optimistically filtered output doesn't need to rerun the slow command to diagnose what went wrong. It handles `grep` and `tail`, and silently disables itself when the command is too complex to safely inject the `tee` call.

**Also,** this extension sets a default timeout on the bash tool of 120s, that only applies if the agent doesn't provide one. This is useful because commands that run longer than 120s but where the agent didn't provide a timeout generally mean that the agent accidentally started an interactive command or a server in the foreground.
