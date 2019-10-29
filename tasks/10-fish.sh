#!/bin/sh
# Install fish v3 and set it as the default shell.
set -e

preferred_version="3"

install_fish() {
  if hash fish 2>/dev/null; then
    if ! fish --version | grep -q "^fish, version $preferred_version"; then
      echo "Fish is installed, but not version $preferred_version!" >&2
      fish --version >&2
      exit 1
    fi
    return 0
  fi

  if hash apt 2>/dev/null; then
    sudo apt-add-repository -y ppa:fish-shell/release-3
    sudo apt-get update
    sudo apt-get install fish
  fi
}

set_shell() {
  shell=$(getent passwd $(id -un) | awk -F : '{print $NF}')
  fish=$(which fish)
  if [ $shell != $fish ]; then
    echo "Changing shell to fish"
    chsh -s "$fish"
  fi
}

install_fish
set_shell
