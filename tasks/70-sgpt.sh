#!/bin/bash
# Install sgpt to ~/.local/bin
set -e
. "$(dirname "$0")/helpers"

TARGET=~/.local/bin/sgpt
VERSION=2.13.0

if [ -x $TARGET ] && [ "$($TARGET version)" = "v$VERSION" ]; then
	exit 0
fi

arch=$(goos_goarch)
arch=${arch/darwin/Darwin}
arch=${arch/linux/Linux}
arch=${arch/amd64/x86_64}
filename=sgpt_${arch}.tar.gz
url=https://github.com/tbckr/sgpt/releases/download/v${VERSION}/${filename}
curl -fsSL "$url" -o "$filename"
mkdir /tmp/sgpt
tar -xf "$filename" -C /tmp/sgpt

mkdir -p "${XDG_CONFIG_HOME:-$HOME/.config}/fish/completions"
mkdir -p "${XDG_DATA_HOME:-$HOME/.local/share}/man/man1"
cp /tmp/sgpt/completions/sgpt.fish "${XDG_CONFIG_HOME:-$HOME/.config}/fish/completions/"
cp /tmp/sgpt/manpages/sgpt.1.gz "${XDG_DATA_HOME:-$HOME/.local/share}/man/man1/"
cp /tmp/sgpt/sgpt "$TARGET"
rm -rf /tmp/sgpt "$filename"
echo "Installed sgpt version $VERSION at $TARGET"
