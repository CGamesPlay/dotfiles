#!/bin/sh
# Install fzf to ~/.local/bin
set -e
. "$(dirname "$0")/helpers"

TARGET=~/.local/bin/fzf
VERSION=0.43.0

if [ -x $TARGET ] && [ "$($TARGET --version | cut -d' ' -f1)" = "$VERSION" ]; then
  exit 0
fi

# For some reason, macOS gets the distribution as a zip instead of a tar file.
ext=tar.gz
if [ "$(uname -s)" = "Darwin" ]; then
    ext=zip
fi

filename=fzf-${VERSION}-$(goos_goarch).${ext}
url=https://github.com/junegunn/fzf/releases/download/${VERSION}/${filename}
curl -fsSL "$url" -o "$filename"
if [ "$(uname -s)" = "Darwin" ]; then
    unzip -o "$filename" -d "$(dirname $TARGET)"
else
    tar xzf "$filename" -C "$(dirname $TARGET)" fzf
fi
rm "$filename"
echo "Installed fzf version $VERSION at $TARGET"
