#!/bin/sh
# Allow Lazy to install all of its plugins.

set -e
if ! command -v nvim >/dev/null; then
	echo "nvim: not found; skipping configuration" >&2
	exit 0
elif ! nvim -u NONE --headless +"if has('nvim-0.8') | quit | else | cquit | endif"; then
	echo "nvim: version too old; skipping configuration" >&2
	exit 0
fi
nvim --headless "+Lazy! sync" +qa
