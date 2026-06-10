#!/bin/sh
# Allow Lazy to install all of its plugins.
set -eu

preferred_version="0.11"
force=false

for arg in "$@"; do
	case "$arg" in
		-f|--force) force=true ;;
	esac
done

is_installed() {
	command -v "$1" > /dev/null
}

install_neovim() {
	if [ "$force" = false ] && is_installed nvim; then
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
	~/.local/bin/eget CGamesPlay/neovim --pre-release -a "tar.gz" -a "$tag" -d --to=nvim.tar.gz
	sudo tar xzf nvim.tar.gz --strip-components=1 -C /usr/local
	export PATH="/usr/local/bin:$PATH"
	cd -

	install_language_pack
}

# NOTE: this is hard-coded to extract to /usr/local. Only usable with
# install_neovim above.
install_language_pack() {
	dir="${TMPDIR:-/tmp}/nvim"
	mkdir -p "$dir"
	curl -fsSL "https://github.com/CGamesPlay/neovim/releases/download/latest/language-pack.tar.gz" \
		-o "$dir/language-pack.tar.gz"
	sudo mkdir -p /usr/local/share/nvim/runtime
	sudo tar xzf "$dir/language-pack.tar.gz" -C /usr/local/share/nvim/runtime
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
