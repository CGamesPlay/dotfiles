#!/bin/sh
# Install binaries using eget (only ones which should always be available).
set -ue

export PATH="$PATH:$HOME/.local/bin"
eget CGamesPlay/dfm --upgrade-only --to=~/.local/bin
eget sigoden/argc --upgrade-only --to=~/.local/bin
