#!/bin/sh
# Install fish v3 and set it as the default shell.
set -e

preferred_version_check="(4\\.[1-9]\\.)"
preferred_version="4.3"

is_installed() {
	command -v "$1" >/dev/null
}

install_fish() {
	if is_installed fish; then
		if ! fish --version | grep -qE "^fish, version $preferred_version_check"; then
			echo "Fish is installed, but not version $preferred_version!" >&2
			printf "Installed: " >&2
			fish --version >&2
		else
			return 0
		fi
	fi
	if [ -f /etc/lsb-release ]; then
		# shellcheck disable=SC1091
		. /etc/lsb-release
		# https://launchpad.net/~fish-shell/+archive/ubuntu/release-4
		mkdir -p /etc/apt/keyrings
		curl -fsSL 'https://keyserver.ubuntu.com/pks/lookup?op=get&search=0x88421E703EDC7AF54967DED473C9FCC9E2BB48DA' | sudo tee /etc/apt/keyrings/ppa-fish-shell.asc >/dev/null
		sudo tee /etc/apt/sources.list.d/ppa-fish-shell-release-4.sources >/dev/null <<-EOF
		Types: deb
		URIs: https://ppa.launchpadcontent.net/fish-shell/release-4/ubuntu
		Suites: $DISTRIB_CODENAME
		Components: main
		Signed-By: /etc/apt/keyrings/ppa-fish-shell.asc

		Types: deb-src
		URIs: https://ppa.launchpadcontent.net/fish-shell/release-4/ubuntu
		Suites: $DISTRIB_CODENAME
		Components: main
		Signed-By: /etc/apt/keyrings/ppa-fish-shell.asc
		EOF

		# If apt-get update has never been run, we need to update everything.
		# Otherwise, let's short-circuit things by only updating the PPA we
		# just added.
		if ! find /var/lib/apt/lists -maxdepth 1 -name "*_dists_${DISTRIB_CODENAME}_main_*" | read -r _; then
			sudo apt-get update
		else
			sudo apt-get update -o Dir::Etc::sourcelist="sources.list.d/ppa-fish-shell-release-4.sources" -o Dir::Etc::sourceparts="-" -o APT::Get::List-Cleanup="0"
		fi

		sudo DEBIAN_FRONTEND=noninteractive apt-get install -y fish --no-install-recommends -o Acquire::https::timeout="30" -o Acquire::https::timeout="30"
	else
		echo "Don't know how to install fish on this platform." >&2
		return 1
	fi
}

set_shell() {
	if is_installed dscl; then
		user="$LOGNAME"
		shell=$(dscl . -read ~/ UserShell | awk '{print $NF}')
	else
		user="$(id -un)"
		shell=$(getent passwd "$user" | awk -F : '{print $NF}')
	fi
	fish=$(which fish)
	if [ "$shell" != "$fish" ]; then
		echo "Changing shell to fish"
		sudo chsh -s "$fish" "$user"
	fi
}

default_variables() {
	fish ~/.config/fish/defaults.fish
}

install_fish
set_shell
default_variables
