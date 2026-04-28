# TUI Extension

Terminal-UI niceties that only activate when stdout is a TTY.

## Features

- Theme detection
- Elapsed-time status widget
- iTerm2 agent-end notification
- Terminal focus reporting

### Theme detection

On `session_start` and `session_tree`, the extension issues an OSC 11 query to ask the terminal for its background color. The response is parsed, luminance is averaged across RGB, and the UI theme is set to `dark` or `light` accordingly.

### Elapsed-time status widget

While the agent is running, a `⏱ M:SS` widget is shown in the status bar, updated every second. The timer starts on `agent_start` and is cleared on `agent_end` and `session_shutdown`.

### iTerm2 agent-end notification

15 seconds after `agent_end`, the extension fires an iTerm2 notification ([sound](https://cgamesplay.com/post/2020/12/09/iterm-notifications/) + RequestAttention + Notification escape sequences) containing the session/cwd name as the title and the first 20 words of the last assistant message as the body. Gaining terminal focus or pressing any key during the delay cancels the pending notification.

## Commands

- `/notify-test` — fire an iTerm2 notification after a 2-second delay, for testing the notification path.

## Events consumed

The extension subscribes to the following pi event-bus channels (`pi.events.on`) so other extensions can integrate with the notification timer:

### `tui:waiting-for-user`

Emitted by another extension when it opens a blocking UI element (e.g. `ctx.ui.select`) and wants to alert a user who may have switched focus away. Receiving this event arms the same 15-second delayed notification used by `agent_end`. Gaining terminal focus or pressing any key cancels the pending notification — there is no paired end event because the user returning to the terminal naturally cancels the timer.

Payload:

```ts
{ title: string; message: string }
```

Both strings are passed verbatim to the iTerm2 notification — the emitting extension is responsible for formatting (the tui extension has no domain knowledge about the caller's situation).

Currently emitted by:

- `session-state` — when the `finish_plan` tool opens its review dialog.
