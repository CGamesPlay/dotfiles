# plan

Custom extension written for this dotfiles repo. Not vendored from an external source.

## Purpose

Session-scoped planning workflow for pi. Manages plan files at
`~/.pi/agent/plans/<session_id>.md` and provides commands for the full
plan → review → implement cycle.

## Commands

- `/plan [task]` — Start a planning session. Resolves `$PLAN_FILE` in
  `prompts/plan.md` to the session-scoped path and sends the expanded prompt.
  An optional task description is appended under a `## Task` heading.

- `/finish-plan` — Open the plan in `bat` (fallback: `less`) for review, then
  show a menu: implement now / reset context + implement / continue planning /
  show plan again.

- `/finish-plan now` — Skip the review dialog and begin implementing immediately
  (sends `prompts/plan-finished.md`).

- `/plans` — List all plan files in `~/.pi/agent/plans/`, showing the first
  heading of each and marking the current session's file.

## Tool

- `finish_plan` — Registered for the model to call when the plan is ready for
  review. Ends the model's turn and triggers the same review flow as
  `/finish-plan` via `agent_end`.

## Prompt templates used

- `prompts/plan.md` — Planning mode instructions (pre-existing). Uses
  `$PLAN_FILE` placeholder substituted by the extension.
- `prompts/plan-finished.md` — Sent to the model to begin implementing with
  full planning context intact.
- `prompts/implement-plan.md` — Sent after a context reset; includes full plan
  contents via `$PLAN_CONTENTS`.

## Behavior notes

- Session names are auto-set from the first heading in the plan file after each
  agent turn (if the session has no name yet).
- If the user cancels the review dialog, `before_agent_start` detects the
  unacknowledged `finish_plan` tool result on the next prompt and injects a
  hidden context note: "The user reviewed the plan and chose not to implement it
  yet." This is session-derived, so it survives tree navigation and resumption.
- Option 2 (reset context) navigates to the oldest branch entry via
  `navigateTree`, then sends the implement prompt so it arrives in a clean
  context.

## License

MIT — written by Ryan Patterson, 2026.
