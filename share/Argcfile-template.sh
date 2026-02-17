#!/usr/bin/env bash
# @describe Example Argcfile

set -eu

main() {
	echo "Hello, argc!"
}

if ! command -v argc >/dev/null; then
	echo "This command requires argc. Install from https://github.com/sigoden/argc" >&2
	exit 100
fi
eval "$(argc --argc-eval "$0" "$@")"
