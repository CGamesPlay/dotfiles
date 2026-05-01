# nvim-remote-lsp pi extension

Lets pi share a running nvim's LSP via the `nvim-remote-lsp` CLI instead of
spawning its own language servers.

## What it does

- **Read hook** — when pi reads a file, calls `nvim-remote-lsp load <file>`
  and (once per session per server) appends a notice to the read result
  telling the model that an LSP is available.
- **Write/edit hook** — calls `nvim-remote-lsp notify-file-changed` on
  modified files so attached LSPs refresh.
- **Agent end** — runs `nvim-remote-lsp diagnostics`; if output changed
  since the last run, sends a steer message with up to 10 lines.
- **Socket management** — discovers an existing nvim whose `getcwd()`
  matches the session's cwd; otherwise spawns a headless `nvim` using your
  normal profile.
- **Bundled skill** — `skills/nvim-remote-lsp/SKILL.md` is exposed via
  `resources_discover` and only loaded while this extension is loaded.

## Settings

`~/.pi/agent/settings.json`:

```json
{
  "nvim-remote-lsp": {
    "socketPatterns": ["$TMPDIR/nvim.*"]
  }
}
```

Patterns support plain `$VAR` / `${VAR}` env substitution only — no
`${VAR:-default}` or other shell features. Each pattern is glob-expanded
after substitution.

## Status item

`nvim: shared` — connected to a pre-existing nvim.
`nvim: self-managed` — using a headless nvim spawned by the extension.
`nvim: ✗` — couldn't connect or spawn.

## Commands

`/nvim-reconnect` — re-scan sockets. If a shared one is found, the
self-managed nvim is killed. The action log (sockets inspected, reasons
for rejection, etc.) is shown via `notify`, not injected into the
conversation.
