#!/bin/sh
# Install aichat to ~/.local/bin
set -e
. "$(dirname "$0")/helpers"

TARGET=~/.local/bin/aichat
VERSION=0.18.0

if [ -x $TARGET ] && $TARGET --version | grep -q $VERSION; then
  exit 0
fi

url="https://github.com/sigoden/aichat/releases/download/v$VERSION/aichat-v${VERSION}-$(rust_triple).tar.gz"
curl -fsSL "$url" -o aichat.tar.gz
tar -xf aichat.tar.gz --directory="$(dirname "$TARGET")" aichat
chmod +x "${TARGET}"
rm aichat.tar.gz
echo "Installed aichat $($TARGET --version) at $TARGET"
