#!/bin/sh
# If the dotfiles are running in a devcontainer, perform some additional
# machine setup.

set -ue

if ! [ -d /usr/local/etc/vscode-dev-containers ] || ! [ -d /workspaces ]; then
	exit 0
fi

# The workspaces directory should only have a single item in it, but if it
# doesn't, assume we can store the persistent data in any of them.
WORKSPACE_DIR=$(find /workspaces/ -mindepth 1 -maxdepth 1 -print -quit)

if [ -z "$WORKSPACE_DIR" ]; then
	# No workspace directory to operate on
	exit 0
fi

# Store the state directory in the workspace directory.
if [ ! -d "$WORKSPACE_DIR/.local/share" ]; then
	mkdir -p "$WORKSPACE_DIR/.local"
	if [ -d ~/.local/share ]; then
		echo "Migrating ~/.local/share to $WORKSPACE_DIR/.local/share" >&2
		mv ~/.local/share "$WORKSPACE_DIR/.local/share"
	else
		mkdir "$WORKSPACE_DIR/.local/share"
	fi
fi
if [ ! -L ~/.local/share ]; then
	if [ -e ~/.local/share ]; then
		echo "Replacing existing ~/.local/share with existing $WORKSPACE_DIR/.local/share" >&2
		rm -rf ~/.local/share
	fi
	ln -s "$WORKSPACE_DIR/.local/share" ~/.local/share
fi
