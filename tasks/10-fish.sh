#!/bin/sh
# Install fish v3 and set it as the default shell.
set -e

preferred_version="3"

is_installed() {
  command -v $1 >/dev/null
}

install_fish() {
  if is_installed fish; then
    if ! fish --version | grep -q "^fish, version $preferred_version"; then
      echo "Fish is installed, but not version $preferred_version!" >&2
      fish --version >&2
      exit 1
    fi
    return 0
  fi

  if is_installed apt 2>/dev/null; then
    sudo apt-add-repository -y ppa:fish-shell/release-3
    sudo apt-get update
    sudo apt-get install fish
  else
    echo "Don't know how to install on this platform" >&2
    exit 1
  fi
}

set_shell() {
  if is_installed dscl; then
    shell=$(dscl . -read ~/ UserShell | awk '{print $NF}')
  else
    shell=$(getent passwd $(id -un) | awk -F : '{print $NF}')
  fi
  fish=$(which fish)
  if [ $shell != $fish ]; then
    echo "Changing shell to fish"
    chsh -s "$fish"
  fi
}

install_fish
set_shell
