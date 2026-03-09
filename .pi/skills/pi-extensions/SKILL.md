---
name: pi-extensions
description: Installs and updates vendored pi/Claude agent extensions and skills into the dotfiles repo. Use when asked to install, vendor, or update a pi extension, subagent, prompt template, or agent definition from a remote source.
---

# Pi Extensions

System-wide pi extensions and skills live in `files/.pi/agent/` in this dotfiles repo. DFM symlinks everything under `files/` into `~`, so `files/.pi/agent/` maps to `~/.pi/agent/`.

Pi discovers extensions at `~/.pi/agent/extensions/` and prompt templates at `~/.pi/agent/prompts/`. Some extensions may also require additional files, typically located in `~/.pi/agent/`.

## Directory Layout

```
files/.pi/agent/
├── extensions/
│   └── <name>/          # multi-file extension (index.ts entry point)
│       ├── index.ts
│       ├── INFO.md      # provenance: URL, commit, license
│       └── ...
└── ...                  # other subdirs as required by specific extensions
```

Pi discovers both `extensions/<name>.ts` (single-file) and `extensions/<name>/index.ts` (directory) automatically.

**Single-file extensions** (upstream is a lone `.ts` file with no companion files) are always vendored as a **directory** anyway — `extensions/<name>/index.ts` — so that `INFO.md` has a natural home alongside the source. Do not place `INFO.md` as a sibling of a standalone `.ts` file; always use the directory form.

After adding or modifying files, run `dfm link` to update symlinks. It is always safe to run.

## Vendoring an Extension

1. Shallow-clone the source repo into a temp directory:
   ```
   git clone --depth=1 <repo-url> /tmp/<name>
   ```

2. Copy the extension into `files/.pi/agent/extensions/<name>`:
   ```
   cp -r /tmp/<name>/<path-to-extension> files/.pi/agent/extensions/<name>
   ```

3. Read the extension's README and follow any extension-specific installation instructions (e.g. copying agent definitions, prompt templates, or other companion files into the appropriate `files/.pi/agent/` subdirectories).

4. Write `files/.pi/agent/extensions/<name>/INFO.md` containing:
   - Source URL and git commit hash (`git rev-parse HEAD` in the cloned repo)
   - Note of any companion files placed in `agents/` or `prompts/`
   - Full license text (check for a `LICENSE` file in the cloned repo; fall back to the repo root)

5. Run `dfm link`.

## Updating an Extension

1. Check for local modifications since the last vendor:
   - Find the vendor commit: `git log --all --oneline -- files/.pi/agent/extensions/<name>/`
   - Diff current state against that commit to detect any soft-fork changes
   - If modified, save them: `git diff <commit> -- files/.pi/agent/extensions/<name>/ > files/.pi/agent/extensions/<name>/soft-fork.patch`

2. Re-run the vendor steps above (overwriting the existing files).

3. Run `dfm link`.

4. If a `soft-fork.patch` exists, attempt to apply it:
   ```
   git apply files/.pi/agent/extensions/<name>/soft-fork.patch
   ```
   If it doesn't apply cleanly, show the user the upstream changelog and describe the conflicts, then work with them to resolve. Prepare a fresh `soft-fork.patch` once resolved.

## Fixes

<!-- Document observed failures here as they occur. -->
