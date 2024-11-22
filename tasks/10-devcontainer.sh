#!/bin/sh
# If the dotfiles are running in a devcontainer, perform some additional
# machine setup.

if ! [ -e /.dockerenv ] || ! [ -d /workspaces ]; then
	exit 0
fi

# The workspaces directory should only have a single item in it, but if it
# doesn't, assume we can store the persistent data in any of them.
WORKSPACE_DIR=$(find /workspaces/ -mindepth 1 -maxdepth 1 | head -1)

mkdir -p "$WORKSPACE_DIR/.local/share/fish"
mkdir -p "$HOME/.local/share/fish"
ln -sf "$WORKSPACE_DIR/.local/share/fish" "$HOME/.local/share/fish"
