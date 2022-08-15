#!/bin/sh
# Install robo to ~/.local/bin
set -e
. "$(dirname "$0")/helpers"

TARGET=~/.local/bin/robo
VERSION=0.7.0

if [ -x $TARGET ]; then
  exit 0
fi

curl -fsSL https://github.com/tj/robo/releases/download/v$VERSION/robo_$(goos_goarch) -o $TARGET
chmod +x $TARGET
echo "Installed robo $($TARGET --version) at $TARGET"
