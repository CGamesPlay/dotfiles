# osc-11

Automatically sets pi's theme to `dark` or `light` by querying the terminal's background color via the [OSC 11](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h3-Operating-System-Commands) escape sequence.

## Behavior

On `session_start` and `session_switch`, the extension sends `ESC ] 11 ; ? BEL` to the terminal. The terminal responds with its background color in `rgb:RRRR/GGGG/BBBB` format. The extension computes the average luminance of the RGB channels and calls `setTheme("dark")` or `setTheme("light")` accordingly.

If the terminal doesn't respond within 500ms, the extension silently does nothing and the current theme is left unchanged.

## Supported Terminals

iTerm2, Ghostty, Kitty, WezTerm, Alacritty, xterm, and most modern terminals.

## Coverage

| Scenario | Event |
|---|---|
| `pi` / `pi --continue` | `session_start` |
| `/resume` / `/new` | `session_switch` |
| `/reload` | `session_start` (new runtime) |
