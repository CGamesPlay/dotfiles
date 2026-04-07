# Session State Extension

A pi extension that mirrors per-session state into a directory kept in sync with the conversation, plus a few features built on top of that mirror. The pieces aren't separable into smaller extensions — plan mode, todo tracking, and checkpoint navigation all share state and all hang off the session-storage replay machinery.

## `$PI_SESSION_STORAGE` directory

A per-session directory whose contents are kept in lockstep with the active conversation branch.

- **Location**: `$PI_SESSION_STORAGE` if set and absolute; otherwise `<session log dir>/<session id>/`, falling back to `<cwd>/.pi/session/<session id>/`. The resolved path is exported as `PI_SESSION_STORAGE` for child processes.
- **Sync model**: on every `session_start`, `session_tree`, and fork, the directory is wiped and rebuilt by replaying every successful `write`/`edit` tool call from the current branch that targets a path inside the directory. Branch summaries are transparently resolved (`resolveEffectiveBranch`) so collapsing a branch doesn't lose mirrored files.
- **External edits**: at `before_agent_start` and `turn_end`, the directory is scanned. Any new/modified/deleted file (compared against the in-memory `trackedFiles` snapshot of `{content, ino, mtimeMs}`) is recorded as a `session-storage-external-mod` custom session entry, so the change survives the next replay.
- **Limits**: external-mod tracking skips files larger than 64 KiB (the agent is notified). Files round-trip as utf-8, with a base64 fallback when the content isn't clean utf-8.
- **Cleanup**: on `session_shutdown`, the directory contents are removed and the directory itself is removed if empty.

Everything below lives inside this directory.

## Git checkpoints

Per-turn worktree snapshots that let the user restore files when navigating to an older message.

- **Storage**: `refs/pi-checkpoints/<session-id>-turn-<n>-<timestamp>` in the cwd's git repo. Disabled (silently) if cwd isn't a git repo, or after the first checkpoint failure in a session.
- **What's snapshotted**: tracked files plus untracked files. Directories named in `IGNORED_DIR_NAMES` (`node_modules`, `.venv`, `dist`, `build`, `__pycache__`, …) are excluded. Untracked files larger than 10 MiB or directories with more than 200 files are skipped.
- **Created**: on `turn_start`, asynchronously (the next restore awaits the pending checkpoint).
- **Restore prompts**: `session_before_fork` and `session_before_tree` find the closest checkpoint by timestamp (walking the `parentSession` chain across forks, max depth 50), diff-stat against the current worktree, and prompt the user. A `before-restore-<ts>` safety checkpoint is created before any restore.

## Plan mode

A "write the plan, then implement it" workflow.

- **Plan file**: `$PI_SESSION_STORAGE/PLAN.md`. The agent writes it via standard `write`/`edit`. The H1 title is used to auto-name the session at `agent_end` (if the session is unnamed).
- **`/plan [initial prompt]`**: turns plan mode on. While active, `before_agent_start` injects `planModePrompt` as a `plan-mode` custom message (rendered as "Plan mode is now active").
- **`finish_plan` tool**: agent calls this when the plan is ready. Blocks on a UI prompt: "Begin implementing immediately" or "Continue planning". Choosing continue (or dismissing the dialog) returns a neutral dismissal message with `terminate: true` so the agent loop stops cleanly and control returns to the user; choosing implement clears plan mode and returns `planFinishedPrompt`.
- **`/finish-plan [now|with-reset]`**: out-of-band review.
  - no arg — opens the plan in `bat`/`less`, then offers four choices: implement now, reset session context then implement, continue planning, show plan again.
  - `now` — skip the dialog; clear plan mode and send `planFinishedPrompt`.
  - `with-reset` — navigate to the first entry of the branch, then send `implementPlanPrompt(planContents)`.

## TODO tracking

A markdown checkbox list, parsed and surfaced in the UI.

- **Todo file**: `$PI_SESSION_STORAGE/TODO.md`. Every non-blank line must match `- [ ] text` or `- [x] text` — no headings, no nested items. Parse failure surfaces inline on the agent's tool result (once per content version) so the agent can self-correct.
- **Status-bar widget**: shows `done/total TODOs` plus the trailing block of items starting at the last completed one. Auto-shown when the list is non-empty; toggled manually with `/todo show` and `/todo hide`.
- **`/todo [list]`**: full-screen overlay with the parsed list (Escape to close).
- **Re-sync triggers**: `session_start`, `session_tree`, `turn_end`, and any internal `write`/`edit` to `TODO.md`.
