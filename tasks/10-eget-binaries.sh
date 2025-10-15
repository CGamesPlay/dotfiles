#!/bin/sh
# Install binaries required for later bootstrap steps
set -ue

export PATH="$PATH:$HOME/.local/bin"
eget CGamesPlay/dfm --upgrade-only --to=~/.local/bin
eget sigoden/argc --upgrade-only --to=~/.local/bin
