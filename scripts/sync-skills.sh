#!/usr/bin/env bash
# Syncs skills between .pi/agent/skills/ and .claude/skills/ using relative symlinks.
# Each skill in .pi/agent/skills/ gets a corresponding symlink in .claude/skills/
# pointing to ../../.pi/agent/skills/<skill-name>.
# Stale symlinks in .claude/skills/ (no longer in .pi) are removed.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PI_SKILLS="$REPO_ROOT/files/.pi/agent/skills"
CLAUDE_SKILLS="$REPO_ROOT/files/.claude/skills"

mkdir -p "$CLAUDE_SKILLS"

# Add symlinks for any skill in .pi/agent/skills/ missing from .claude/skills/
for skill_dir in "$PI_SKILLS"/*/; do
    skill="$(basename "$skill_dir")"
    target="$CLAUDE_SKILLS/$skill"
    # Relative path from .claude/skills/<name> -> ../../.pi/agent/skills/<name>
    rel="../../.pi/agent/skills/$skill"

    if [[ -L "$target" ]]; then
        existing="$(readlink "$target")"
        if [[ "$existing" == "$rel" ]]; then
            echo "ok       $skill"
        else
            echo "updating $skill  ($existing -> $rel)"
            ln -sfn "$rel" "$target"
        fi
    elif [[ -e "$target" ]]; then
        echo "warning: $target exists and is not a symlink, skipping" >&2
    else
        echo "linking  $skill"
        ln -sn "$rel" "$target"
    fi
done

# Remove stale symlinks in .claude/skills/ that no longer exist in .pi/agent/skills/
for link in "$CLAUDE_SKILLS"/*/; do
    [[ -e "$link" || -L "$link" ]] || continue
    skill="$(basename "$link")"
    if [[ ! -d "$PI_SKILLS/$skill" ]]; then
        if [[ -L "$link" ]]; then
            echo "removing stale symlink: $skill"
            rm "$link"
        else
            echo "warning: $CLAUDE_SKILLS/$skill is not in .pi/agent/skills/ and is not a symlink, skipping" >&2
        fi
    fi
done
