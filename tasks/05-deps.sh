#!/bin/bash
# Set up system dependencies all in a single place.
set -e
. "$(dirname "$0")/helpers"

packages=()
type curl >/dev/null || packages+=(curl)
type tar >/dev/null || packages+=(tar)
type git >/dev/null || packages+=(git)
type vim >/dev/null || packages+=(vim)
type tmux >/dev/null || packages+=(tmux)
type fish >/dev/null || packages+=(fish)
type direnv >/dev/null || packages+=(direnv)

if [[ "${#packages[@]}" -gt 0 ]]; then
	if is_installed apt-get 2>/dev/null; then
		sudo apt-get update
		sudo apt-get install -y curl tar git vim tmux fish direnv
	else
		echo "Missing packages: ${packages[*]}" >&2
		echo "Don't know how to install on this platform" >&2
		exit 1
	fi
fi
