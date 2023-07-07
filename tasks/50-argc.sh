#!/bin/sh
# Install robo to ~/.local/bin
set -e
. "$(dirname "$0")/helpers"

TARGET=~/.local/bin/argc
VERSION=1.7.0

if [ -x $TARGET ] && $TARGET --argc-version | grep -q $VERSION; then
  exit 0
fi

url=https://github.com/sigoden/argc/releases/download/v$VERSION/argc-v${VERSION}-$(rust_triple).tar.gz
curl -fsSL $url -o argc.tar.gz
tar -xf argc.tar.gz --directory=$(dirname $TARGET) argc
chmod +x ${TARGET}
rm argc.tar.gz
echo "Installed argc $($TARGET --argc-version) at $TARGET"
