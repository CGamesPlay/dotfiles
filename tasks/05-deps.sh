#!/bin/bash
# Set up system dependencies all in a single place.
set -e
. "$(dirname "$0")/helpers"

packages=()
type curl >/dev/null 2>&1 || packages+=(curl)
type git >/dev/null 2>&1 || packages+=(git)
type nvim >/dev/null 2>&1 || packages+=(neovim)
type tar >/dev/null 2>&1 || packages+=(tar)
type tmux >/dev/null 2>&1 || packages+=(tmux)
type vim >/dev/null 2>&1 || packages+=(vim)

if [[ "${#packages[@]}" -gt 0 ]]; then
	if is_installed apt-get 2>/dev/null; then
		sudo apt-get update
		sudo apt-get install -y "${packages[@]}"
	else
		echo "Missing packages: ${packages[*]}" >&2
		echo "Don't know how to install on this platform" >&2
		exit 1
	fi
fi
