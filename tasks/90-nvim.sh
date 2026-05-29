#!/bin/sh
# Allow Lazy to install all of its plugins.
set -eu

preferred_version="0.11"

is_installed() {
	command -v "$1" > /dev/null
}

install_neovim() {
	if is_installed nvim; then
		if ! nvim -u NONE --headless +"if has('nvim-$preferred_version') | quit | else | cquit | endif"; then
			echo "Neovim is installed, but not version $preferred_version!" >&2
			nvim --version
		else
			return 0
		fi
	fi

	if [ "$(uname -m)" = "x86_64" ]; then
		tag="x86_64"
	else
		tag="arm64"
	fi
	dir="${TMPDIR:-/tmp}/nvim"
	mkdir -p "$dir"
	cd "$dir"
	~/.local/bin/eget neovim/neovim -a "tar.gz" -a "$tag" -d --to=nvim.tar.gz
	sudo tar xzf nvim.tar.gz --strip-components=1 -C /usr/local
	export PATH="/usr/local/bin:$PATH"
	cd -
}

sync_plugins() {
	# The lazy lockfile includes lazy itself, but if it isn't already installed
	# then it will install the latest version instead of what's locked here. As
	# a result, we snapshot the lockfile, then run twice to cause lazy to
	# downgrade itself if necessary.
	orig_lock="$(cat files/.config/nvim/lazy-lock.json)"
	nvim --headless "+Lazy restore" +qa
	echo "$orig_lock" > files/.config/nvim/lazy-lock.json
	nvim --headless "+Lazy restore" +qa
}

install_neovim
sync_plugins
