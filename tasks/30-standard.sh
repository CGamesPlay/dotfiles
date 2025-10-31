#!/bin/bash
# Install packages that I generally want available.
set -ueo pipefail

export PATH="$PATH:$HOME/.local/bin"
list=(
	bat
	delta
	direnv
	eza
	fzf
	jj
	zoxide
)
for i in "${list[@]}"; do
	if ! command -v "$i" >/dev/null; then
		@get "$i"
	fi
done
