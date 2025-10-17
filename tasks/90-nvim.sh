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
	cd "${TMPDIR:-/tmp}"
	mkdir nvim
	cd nvim
	eget neovim/neovim -a "$tag" --to="./nvim"
	./nvim --appimage-extract
	sudo rsync -a squashfs-root/usr/ /usr/local/
}

sync_plugins() {
	nvim --headless "+Lazy! restore" +qa
}

install_neovim
sync_plugins
