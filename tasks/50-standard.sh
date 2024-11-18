#!/bin/bash
# Install packages that I generally want available.
set -ueo pipefail

list=(
	bat
	direnv
	eza
	fzf
)
for i in "${list[@]}"; do
	if ! command -v "$i" >/dev/null; then
		@get "$i"
	fi
done

if [ ! -d ~/.config/nvm ]; then
	@get nvm
fi
