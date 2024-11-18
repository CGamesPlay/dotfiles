#!/bin/sh
# Install fish v3 and set it as the default shell.
set -e

preferred_version="3.[4-9]"

is_installed() {
  command -v $1 >/dev/null
}

install_fish() {
  if is_installed fish; then
    if ! fish --version | grep -q "^fish, version $preferred_version"; then
      echo "Fish is installed, but not version $preferred_version!" >&2
      fish --version >&2
    else
      return 0
    fi
  fi
  if [ -f /etc/lsb-release ]; then
    # https://launchpad.net/~fish-shell/+archive/ubuntu/release-3
    release=$(grep DISTRIB_CODENAME /etc/lsb-release | cut -d= -f2)
    cat <<-EOF | sudo tee /etc/apt/sources.list.d/ppa-fish-shell.list
	deb https://ppa.launchpadcontent.net/fish-shell/release-3/ubuntu $release main
	deb-src https://ppa.launchpadcontent.net/fish-shell/release-3/ubuntu $release main
	EOF
    sudo apt-key adv --keyserver keyserver.ubuntu.com --recv-keys 88421E703EDC7AF54967DED473C9FCC9E2BB48DA
    sudo apt-get update -o Dir::Etc::sourcelist="sources.list.d/ppa-fish-shell.list" -o Dir::Etc::sourceparts="-" -o APT::Get::List-Cleanup="0"
    sudo apt-get install fish
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
