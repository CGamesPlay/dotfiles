# LSP Extension

Language Server Protocol integration for pi-coding-agent.

## Highlights

- **Hook** (`lsp.ts`): Auto-diagnostics (default at agent end; optional per `write`/`edit`)
- **Tool** (`lsp-tool.ts`): On-demand LSP queries (definitions, references, hover, symbols, diagnostics, signatures)
- Manages one LSP server per project root and reuses them across turns
- **Efficient**: Bounded memory usage via LRU cache and idle file cleanup
- Supports TypeScript/JavaScript, Vue, Svelte, Dart/Flutter, Python, Go, Kotlin, Swift, and Rust

## Supported Languages

Language server configuration is defined in [`languages.json`](./languages.json) — adding a new server only requires editing that file.

| Language | Server | Detection |
|----------|--------|-----------|
| TypeScript/JavaScript | `typescript-language-server` | `package.json`, `tsconfig.json` |
| Vue | `vue-language-server` | `package.json`, `vite.config.ts` |
| Svelte | `svelteserver` | `svelte.config.js` |
| Dart/Flutter | `dart language-server` | `pubspec.yaml` |
| Python | `pyright-langserver` | `pyproject.toml`, `requirements.txt` |
| Go | `gopls` | `go.mod` |
| Kotlin | `kotlin-ls` | `settings.gradle(.kts)`, `build.gradle(.kts)`, `pom.xml` |
| Swift | `sourcekit-lsp` | `Package.swift`, Xcode (`*.xcodeproj` / `*.xcworkspace`) |
| Rust | `rust-analyzer` | `Cargo.toml` |
| Lua | `lua-language-server` | `.luarc.json`, `stylua.toml` |

### Known Limitations

**rust-analyzer**: Very slow to initialize (30-60+ seconds) because it compiles the entire Rust project before returning diagnostics. This is a known rust-analyzer behavior, not a bug in this extension. For quick feedback, consider using `cargo check` directly.

## Usage

### Installation

Install the package and enable extensions:
```bash
pi install npm:lsp-pi
pi config
```

Dependencies are installed automatically during `pi install`.

### Prerequisites

Install the language servers you need:

```bash
# TypeScript/JavaScript
npm i -g typescript-language-server typescript

# Vue
npm i -g @vue/language-server

# Svelte
npm i -g svelte-language-server

# Python
npm i -g pyright

# Go (install gopls via go install)
go install golang.org/x/tools/gopls@latest

# Kotlin (kotlin-ls)
brew install JetBrains/utils/kotlin-lsp

# Swift (sourcekit-lsp; macOS)
# Usually available via Xcode / Command Line Tools
xcrun sourcekit-lsp --help

# Rust (install via rustup)
rustup component add rust-analyzer

# Lua
brew install lua-language-server
# or via Mason (neovim): :MasonInstall lua-language-server
```

The extension spawns binaries from your PATH.

## How It Works

### Hook (auto-diagnostics)

1. On `session_start`, warms up LSP for detected project type
2. Tracks files touched by `write`/`edit`
3. Default (`agent_end`): at agent end, sends touched files to LSP and posts a diagnostics message
4. Optional (`edit_write`): per `write`/`edit`, appends diagnostics to the tool result
5. Shows notification with diagnostic summary
6. **Memory Management**: Keeps up to 30 files open per LSP server (LRU eviction), automatically closes idle files (> 60s), and shuts down all LSP servers after 2 minutes of post-agent inactivity (servers restart lazily when files are read again).
7. **Robustness**: Reuses cached diagnostics if a server doesn't re-publish them for unchanged files, avoiding false timeouts on re-analysis.

### Tool (on-demand queries)

The `lsp` tool provides these actions:

| Action | Description | Requires |
|--------|-------------|----------|
| `definition` | Jump to definition | `file` + (`line`/`column` or `query`) |
| `references` | Find all references | `file` + (`line`/`column` or `query`) |
| `hover` | Get type/docs info | `file` + (`line`/`column` or `query`) |
| `symbols` | List symbols in file | `file`, optional `query` filter |
| `diagnostics` | Get single file diagnostics | `file`, optional `severity` filter |
| `workspace-diagnostics` | Get diagnostics for multiple files | `files` array, optional `severity` filter |
| `signature` | Get function signature | `file` + (`line`/`column` or `query`) |
| `rename` | Rename symbol across files | `file` + (`line`/`column` or `query`) + `newName` |
| `codeAction` | Get available quick fixes/refactors | `file` + `line`/`column`, optional `endLine`/`endColumn` |

**Query resolution**: For position-based actions, you can provide a `query` (symbol name) instead of `line`/`column`. The tool will find the symbol in the file and use its position.

**Severity filtering**: For `diagnostics` and `workspace-diagnostics` actions, use the `severity` parameter to filter results:
- `all` (default): Show all diagnostics
- `error`: Only errors
- `warning`: Errors and warnings
- `info`: Errors, warnings, and info
- `hint`: All including hints

**Workspace diagnostics**: The `workspace-diagnostics` action analyzes multiple files at once. Pass an array of file paths in the `files` parameter. Each file will be opened, analyzed by the appropriate LSP server, and diagnostics returned. Files are cleaned up after analysis to prevent memory bloat.

```bash
# Find all TypeScript files and check for errors
find src -name "*.ts" -type f | xargs ...

# Example tool call
lsp action=workspace-diagnostics files=["src/index.ts", "src/utils.ts"] severity=error
```

Example questions the LLM can answer using this tool:
- "Where is `handleSessionStart` defined in `lsp-hook.ts`?"
- "Find all references to `getManager`"
- "What type does `getDefinition` return?"
- "List symbols in `lsp-core.ts`"
- "Check all TypeScript files in src/ for errors"
- "Get only errors from `index.ts`"
- "Rename `oldFunction` to `newFunction`"
- "What quick fixes are available at line 10?"

## Settings

Use `/lsp` to configure the auto diagnostics hook:
- Mode: default at agent end; can run after each edit/write or be disabled
- Scope: session-only or global (`~/.pi/agent/settings.json`)

To disable auto diagnostics, choose "Disabled" in `/lsp` or set in `~/.pi/agent/settings.json`:
```json
{
  "lsp": {
    "hookMode": "disabled"
  }
}
```
Other values: `"agent_end"` (default) and `"edit_write"`.

Agent-end mode analyzes files touched during the full agent response (after all tool calls complete) and posts a diagnostics message only once. Disabling the hook does not disable the `/lsp` tool.

## Adding a Language Server

All language server configuration lives in [`languages.json`](./languages.json). To add a new server, append an entry to the `servers` array — no TypeScript changes are needed for typical servers.

### Example: adding `clangd` for C/C++

```json
{
  "id": "clangd",
  "extensions": [".c", ".cc", ".cpp", ".h", ".hpp"],
  "languageIds": { ".c": "c", ".cc": "cpp", ".cpp": "cpp", ".h": "c", ".hpp": "cpp" },
  "command": "clangd",
  "args": ["--stdio"],
  "rootMarkers": ["compile_commands.json", "CMakeLists.txt", ".clangd"],
  "warmupMarkers": ["CMakeLists.txt"],
  "diagnosticsTimeoutMs": 10000,
  "installHint": "brew install llvm"
}
```

### `languages.json` schema

Each entry in the `servers` array supports the following fields:

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | ✓ | Unique server identifier (used as the client key internally) |
| `extensions` | string[] | ✓ | File extensions this server handles (e.g. `[".ts", ".tsx"]`) |
| `languageIds` | `{ext: string}` | ✓ | Maps each extension to its LSP `languageId` (e.g. `{".ts": "typescript"}`) |
| `command` | string | ✓* | Binary name resolved via `PATH` (required unless `spawnStrategy` is set) |
| `args` | string[] | — | Arguments passed to the binary; defaults to `["--stdio"]` |
| `spawnStrategy` | string | ✓* | Use a built-in spawn strategy instead of `command` (see below) |
| `rootMarkers` | string[] | — | Filenames searched upward from the open file to locate the project root |
| `rootMarkersPreferred` | string[] | — | Tried before `rootMarkers`; first hit wins (used for multi-pass root detection) |
| `rootFallback` | `"cwd"` | — | Fall back to the working directory when no root marker is found |
| `rootStrategy` | string | — | Use a built-in root strategy instead of marker search (see below) |
| `warmupMarkers` | string[] | — | Filenames checked in `cwd` at session start to trigger eager LSP warm-up |
| `diagnosticsTimeoutMs` | number | — | How long to wait for diagnostics; defaults to `3000` |
| `installHint` | string | — | Shown in "no LSP available" messages to guide installation |

\* Either `command` or `spawnStrategy` is required.

### Root detection

The engine searches upward from the open file's directory toward `cwd`, stopping at the first directory that contains one of the marker files.

**Two-pass detection** (`rootMarkersPreferred` + `rootMarkers`): when both fields are present, `rootMarkersPreferred` is tried first. If nothing is found, `rootMarkers` is tried. This is used by `gopls` (`go.work` preferred over `go.mod`) and `kotlin` (`settings.gradle*` preferred over `build.gradle*`).

**`rootFallback: "cwd"`**: when no marker is found at all, the working directory is used as the root. Useful for languages like Lua where project config is optional.

### Built-in spawn strategies

Some servers need custom spawn logic that can't be expressed as a simple command + args. Set `spawnStrategy` to one of these values instead of `command`:

| Value | Server | What it does |
|---|---|---|
| `"dart"` | Dart/Flutter | Reads `pubspec.yaml` to detect Flutter projects; resolves the correct `dart` binary from the Flutter SDK |
| `"typescript"` | TypeScript/JS | Prefers a local `node_modules/.bin/typescript-language-server` over the global one |
| `"kotlin"` | Kotlin | Tries JetBrains `kotlin-lsp` first, falls back to `kotlin-language-server`; supports auto-download via `PI_LSP_AUTO_DOWNLOAD_KOTLIN_LSP=1` and path override via `PI_LSP_KOTLIN_LSP_PATH` |
| `"swift"` | Swift | Tries `sourcekit-lsp` directly, then falls back to `xcrun sourcekit-lsp` |

### Built-in root strategies

| Value | Server | What it does |
|---|---|---|
| `"swift"` | Swift | Scans for `Package.swift`, `*.xcodeproj/`, or `*.xcworkspace/` directories |

## File Structure

| File | Purpose |
|------|---------|
| `languages.json` | **All per-language config** — add new servers here |
| `lsp.ts` | Hook extension (auto-diagnostics; default at agent end) |
| `lsp-tool.ts` | Tool extension (on-demand LSP queries) |
| `lsp-core.ts` | LSPManager class, engine that reads `languages.json`, singleton manager |
| `package.json` | Declares both extensions via "pi" field |

## Testing

```bash
# Unit tests (root detection, configuration)
npm test

# Tool tests
npm run test:tool

# Integration tests (spawns real language servers)
npm run test:integration

# Run rust-analyzer tests (slow, disabled by default)
RUST_LSP_TEST=1 npm run test:integration
```

## License

MIT
