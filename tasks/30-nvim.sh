#!/bin/sh
# Allow Lazy to install all of its plugins.
set -e

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
	if [ -f /etc/lsb-release ]; then
		# shellcheck disable=SC1091
		. /etc/lsb-release
		# https://launchpad.net/~neovim-ppa/+archive/ubuntu/unstable
		mkdir -p /etc/apt/keyrings
		curl -fsSL 'https://keyserver.ubuntu.com/pks/lookup?op=get&search=0x9DBB0BE9366964F134855E2255F96FCF8231B6DD' | sudo tee /etc/apt/keyrings/ppa-neovim-ppa.asc >/dev/null
		sudo tee /etc/apt/sources.list.d/ppa-neovim-ppa-unstable.sources >/dev/null <<-EOF
		Types: deb
		URIs: https://ppa.launchpadcontent.net/neovim-ppa/unstable/ubuntu
		Suites: $DISTRIB_CODENAME
		Components: main
		Signed-By: /etc/apt/keyrings/ppa-neovim-ppa.asc

		Types: deb-src
		URIs: https://ppa.launchpadcontent.net/neovim-ppa/unstable/ubuntu
		Suites: $DISTRIB_CODENAME
		Components: main
		Signed-By: /etc/apt/keyrings/ppa-neovim-ppa.asc
		EOF

		sudo apt-get update -o Dir::Etc::sourcelist="sources.list.d/ppa-neovim-ppa-unstable.sources" -o Dir::Etc::sourceparts="-" -o APT::Get::List-Cleanup="0"
		sudo DEBIAN_FRONTEND=noninteractive apt-get install -y neovim
	else
		echo "Don't know how to install neovim on this platform" >&2
		return 1
	fi
}

sync_plugins() {
	nvim --headless "+Lazy! restore" +qa
}

install_neovim
sync_plugins
