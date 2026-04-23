---
name: pi-extensions
description: Installs and updates vendored pi/Claude agent extensions and skills into the dotfiles repo. Use when asked to install, vendor, or update a pi extension, subagent, prompt template, or agent definition from a remote source.
---

# Pi Extensions

System-wide pi extensions and skills live in `share/pi` in this dotfiles repo, which is a normal pi package, installed globally.

## Directory Layout

```
share/pi
├── package.json         # dependencies for all extensions (merged)
├── extensions/
│   └── <name>/          # multi-file extension (index.ts entry point)
│       ├── index.ts
│       ├── INFO.md      # provenance: URL, commit, license
│       └── ...
└── ...                  # other subdirs as required by specific extensions
```

Pi discovers both `extensions/<name>.ts` (single-file) and `extensions/<name>/index.ts` (directory) automatically.

**Single-file extensions** (upstream is a lone `.ts` file with no companion files) are always vendored as a **directory** anyway — `extensions/<name>/index.ts` — so that `INFO.md` has a natural home alongside the source. Do not place `INFO.md` as a sibling of a standalone `.ts` file; always use the directory form.

After adding or modifying files, tell the user to `/reload` to see the results immediately.

## Vendoring an Extension

1. Shallow-clone the source repo into a temp directory:
   ```
   git clone --depth=1 <repo-url> /tmp/<name>
   ```

2. Copy the extension into `share/pi/extensions/<name>`:
   ```
   cp -r /tmp/<name>/<path-to-extension> share/pi/extensions/<name>
   ```

3. Read the extension's README and follow any extension-specific installation instructions (e.g. copying agent definitions, prompt templates, or other companion files into the appropriate `share/pi/` subdirectories).

4. Write `share/pi/extensions/<name>/INFO.md` containing:
   - Source URL and git commit hash (`git rev-parse HEAD` in the cloned repo)
   - Note of any companion files placed in `agents/` or `prompts/`
   - Full license text (check for a `LICENSE` file in the cloned repo; fall back to the repo root)

## Updating an Extension

1. Check for local modifications since the last vendor:
   - Find the vendor commit: `git log --all --oneline -- share/pi/extensions/<name>/`
   - Diff current state against that commit to detect any soft-fork changes
   - If modified, save them: `git diff <commit> -- share/pi/extensions/<name>/ > share/pi/extensions/<name>/soft-fork.patch`

2. Re-run the vendor steps above (overwriting the existing files).

3. If a `soft-fork.patch` exists, attempt to apply it:
   ```
   git apply share/pi/extensions/<name>/soft-fork.patch
   ```
   If it doesn't apply cleanly, show the user the upstream changelog and describe the conflicts, then work with them to resolve. Prepare a fresh `soft-fork.patch` once resolved.

## Testing Extensions

Extensions are tested using `node:test` (built into Node 24) with `tsx` for TypeScript execution. Tests live under `share/pi/extensions/<name>/tests/` (colocated with the extension) or `share/pi/tests/` (cross-extension) and run from the `share/pi/` package root.

### Running Tests

```bash
cd share/pi
npm test                    # run all tests against saved snapshots
npm run test:update         # regenerate snapshot files
```

Tests should run with no API keys in the environment. When debugging locally, prefer `env -u OPENAI_API_KEY -u ANTHROPIC_API_KEY npm test` so a stray key doesn't mask an auth-bypass regression in the harness.

### Writing Tests

Pick the testing style that matches what you're exercising:

- **Pure functions** (renderers, reducers, replay logic) — call them directly with synthetic inputs. Use `t.assert.snapshot()` for rendered output, `assert.deepStrictEqual` for data structures. No harness needed.
- **Extension behavior** (hooks firing, tools running, custom session entries being emitted, tool_call/tool_result enrichment) — use the test harness at `share/pi/test-harness/`. It boots the extension inside a real pi `AgentSession` with a scripted "LLM" so you can exercise end-to-end flows without a network or API keys.

#### Test harness quick start

```typescript
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  createTestSession,
  calls,
  says,
  type TestSession,
} from "../../../test-harness/index.js";

const EXTENSION = path.resolve(import.meta.dirname, "../index.ts");

describe("my-extension", () => {
  let t: TestSession | undefined;
  afterEach(() => { t?.dispose(); t = undefined; });

  it("handles a tool call", async () => {
    t = await createTestSession({
      extensions: [EXTENSION],
      mockTools: { bash: "ok", read: "ok", write: "ok", edit: "ok" },
    });

    await t.turn("do something", [
      calls("write", { path: "/tmp/x", content: "hi" }),
      says("done"),
    ]);

    assert.equal(t.events.toolResultsFor("write").length, 1);
  });
});
```

#### Harness API

- `createTestSession({ extensions, cwd?, mockTools?, mockUI?, extensionFactories?, systemPrompt?, propagateErrors? })` — boots a real `AgentSession` with the extension loaded. Auth is fully bypassed. If `cwd` is omitted, a temp dir is created and cleaned up on `dispose()`.
- `t.turn(prompt, actions)` — runs one full user→`agent_end` cycle. The `actions` array scripts what the "model" does: `calls("tool", args)` and `says("text")`. Every turn must end with a `says(...)` or the harness will fail it. Call `t.turn` multiple times for multi-turn scenarios.
- `calls(tool, args).then((result) => { ... })` — late callback fires with the tool result; useful when one call's output feeds the next. Pass a function for `args` to late-bind: `calls("x", () => ({ id: capturedId }))`.
- `t.events` — recorded events: `toolCallsFor(name)`, `toolResultsFor(name)`, `toolSequence()`, `blockedCalls()`, `uiCallsFor(method)`, plus raw `all`, `toolCalls`, `toolResults`, `messages`, `ui`.
- `t.sessionManager` — the real `SessionManager`. Use it between turns for `branchWithSummary`, `appendCompaction`, `getLeafId`, `getBranch` — e.g. to set up branch-summary or compaction scenarios without fighting the DSL.
- `t.session` — escape hatch to the underlying `AgentSession` for anything else.
- `t.dispose()` — cleans up the session and temp dir. Always call in `afterEach`.

#### Mocks

- **`mockTools`**: map of tool name → handler. Handler is a string (returned as text), a full `ToolResult` object, or a function `(params) => string | ToolResult`. Mocked tools **do not** run their real implementations but extension `tool_call`/`tool_result` hooks **do** fire — so blocking and enrichment work normally. Leave a tool unmocked if the test needs its real side effects (e.g. leaving `write` unmocked so the file actually lands on disk).
- **`mockUI`**: `confirm`/`select`/`input`/`editor` as static values or functions. Defaults: confirm→true, select→first option, input→"", editor→"". All UI calls are recorded in `t.events.ui` regardless.

#### Common patterns

- **Observable assertions, not internals**: the extension owns its own `createAppState()` inside the harness — tests cannot reach it. Assert on observable surfaces instead: on-disk files, `t.sessionManager.getBranch()` for custom session entries the extension emitted, `t.events.toolResultsFor(...)` for tool outputs, `t.events.ui` for UI interactions.
- **Pre-boot environment**: hooks like `session_start` fire inside `createTestSession`. If the extension reads `process.env.FOO` during those hooks, set it **before** calling `createTestSession`.
- **Exporting internals for direct unit tests**: when a lib function is worth testing with synthetic inputs (pure replay, parsers, etc.), add `export` and call it directly — don't force everything through the harness. The default export (extension entry point) stays unchanged; pi only calls the default, so named exports are invisible to the loader.
- **Mock Theme for renderer tests**: wrap text with readable markers instead of ANSI codes so snapshots stay human-readable and terminal-independent:
  ```typescript
  function createMockTheme(): Theme {
    return {
      fg: (color, text) => `[${color}:${text}]`,
      bold: (text) => `[bold:${text}]`,
      // ...
    } as unknown as Theme;
  }
  ```

### Snapshot Management

Snapshot files (`<name>.test.ts.snapshot`) are auto-generated by `node:test`. They use an `exports["test name 1"]` format. Always commit snapshot files. When a snapshot changes unexpectedly, inspect the diff before updating.

## Fixes

<!-- Document observed failures here as they occur. -->
