#!/bin/sh
# Install robo to ~/.local/bin
set -e
. "$(dirname "$0")/helpers"

TARGET=~/.local/bin/robo
VERSION=0.7.0-cgamesplay

if [ -x $TARGET ]; then
  exit 0
fi

url=https://github.com/cgamesplay/robo/releases/download/v$VERSION/robo_$(goos_goarch).gz
if ! curl -fsSL $url -o ${TARGET}.gz; then
  echo "Skipping robo installation" >&2
  exit 0
fi
gunzip ${TARGET}.gz
chmod +x ${TARGET}
echo "Installed robo $($TARGET --version) at $TARGET"
