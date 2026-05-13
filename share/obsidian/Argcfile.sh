#!/usr/bin/env bash

set -eu

# @cmd Install the plugin to the local notes vault, and reload
install() {
	NOTES_DIR="${NOTES_DIR:?}"
	obsidian=(obsidian vault="$(basename "$NOTES_DIR")")
	npm run build
	mkdir -p "$NOTES_DIR/.obsidian/plugins/dotfiles"
	rsync -a --delete dist/ "$NOTES_DIR/.obsidian/plugins/dotfiles/"

	if [[ "$("${obsidian[@]}" plugin id=dotfiles)" == *"not found."* ]]; then
		"${obsidian[@]}" reload
		sleep 1
	fi
	if [[ "$("${obsidian[@]}" plugin id=dotfiles | grep enabled)" == *false* ]]; then
		"${obsidian[@]}" plugin:enable id=dotfiles
	else
		"${obsidian[@]}" plugin:reload id=dotfiles
	fi
}

if ! command -v argc >/dev/null; then
	echo "This command requires argc. Install from https://github.com/sigoden/argc" >&2
	exit 100
fi
eval "$(argc --argc-eval "$0" "$@")"
