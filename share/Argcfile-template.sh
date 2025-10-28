#!/usr/bin/env bash
# @describe Example Argcfile
# For more information about argc, see https://github.com/sigoden/argc
# For a quick "cheat sheet" Argcfile, see dotfiles/share/Argc-sample.sh

set -eu

main() {
	echo "Hello, argc!"
}

if ! command -v argc >/dev/null; then
	echo "This command requires argc. Install from https://github.com/sigoden/argc" >&2
	exit 100
fi
eval "$(argc --argc-eval "$0" "$@")"
