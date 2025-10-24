#!/bin/sh
# If the dotfiles are running in a devcontainer, perform some additional
# machine setup.

set -x

if ! [ -d /usr/local/etc/vscode-dev-containers ]; then
	exit 0
fi

# The workspaces directory should only have a single item in it, but if it
# doesn't, assume we can store the persistent data in any of them.
WORKSPACE_DIR=$(find /workspaces/ -mindepth 1 -maxdepth 1 | head -1)

# Store the state directory in the workspace directory.
if [ ! -d "$WORKSPACE_DIR/.local/share" ]; then
	mkdir -p "$WORKSPACE_DIR/.local"
	if [ -d ~/.local/share ]; then
		mv ~/.local/share "$WORKSPACE_DIR/.local/share"
	else
		mkdir "$WORKSPACE_DIR/.local/share"
	fi
fi
if [ ! -L ~/.local/share ]; then
	rm -rf ~/.local/share
	ln -s "$WORKSPACE_DIR/.local/share" ~/.local/share
fi
