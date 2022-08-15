#!/bin/sh
# Install fzf to ~/.local/bin
set -e
. "$(dirname "$0")/helpers"

TARGET=~/.local/bin/fzf
VERSION=0.32.1

if [ -x $TARGET ] && [ "$($TARGET --version | cut -d' ' -f1)" = "$VERSION" ]; then
  exit 0
fi

filename=fzf-${VERSION}-$(goos_goarch).tar.gz
url=https://github.com/junegunn/fzf/releases/download/${VERSION}/${filename}
curl -fsSL $url -o $filename
tar xzf $filename -C $(dirname $TARGET) fzf
rm $filename
echo "Installed fzf version $VERSION at $TARGET"
