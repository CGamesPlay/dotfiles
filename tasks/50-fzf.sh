#!/bin/sh
# Install fzf to ~/.local/bin
set -e

TARGET=~/.local/bin/fzf
VERSION=0.19.0

case `uname -s` in
  Darwin)
    ARCH=darwin_amd64
    ;;
  Linux)
    ARCH=linux_amd64
    ;;
  *)
    echo "Unsupported system: `uname -s`" >&2
    exit 1
    ;;
esac

if [ -x $TARGET ] && [ "$($TARGET --version | cut -d' ' -f1)" = "$VERSION" ]; then
  exit 0
fi

filename=fzf-${VERSION}-${ARCH}.tgz
curl -sSL https://github.com/junegunn/fzf-bin/releases/download/$VERSION/$filename -o $filename
tar xzf $filename -C $(dirname $TARGET) fzf
rm $filename
echo "Installed fzf version $VERSION at $TARGET"
