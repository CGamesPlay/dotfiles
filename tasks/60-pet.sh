#!/bin/sh
# Install pet to ~/.local/bin
set -e
. "$(dirname "$0")/helpers"

TARGET=~/.local/bin/pet
VERSION=0.3.6

if [ -x $TARGET ] && [ "$($TARGET version)" = "pet version $VERSION" ]; then
  exit 0
fi

filename=pet_${VERSION}_$(goos_goarch).tar.gz
curl -sSL https://github.com/knqyf263/pet/releases/download/v$VERSION/$filename -o $filename
tar xzf $filename -C $(dirname $TARGET) pet
rm $filename
echo "Installed pet version $VERSION at $TARGET"
