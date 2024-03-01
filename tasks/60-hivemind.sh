#!/bin/bash
# Install hivemind to ~/.local/bin
set -e
. "$(dirname "$0")/helpers"

TARGET=~/.local/bin/hivemind
VERSION=1.1.0

if [ -x $TARGET ] && [ "$($TARGET --version | cut -d' ' -f3)" = "$VERSION" ]; then
	exit 0
fi

arch=$(goos_goarch)
arch=${arch/darwin/macos}
arch=${arch/_/-}
filename=hivemind-v${VERSION}-${arch}.gz
url=https://github.com/DarthSim/hivemind/releases/download/v${VERSION}/${filename}
curl -fsSL "$url" -o "$filename"
gzip -d "$filename"
mv "$(basename "$filename" .gz)" "$TARGET"
chmod +x "$TARGET"
echo "Installed hivemind version $VERSION at $TARGET"
