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
  if [ $shell != $fish ]; then
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
