#!/bin/sh
# Install pet to ~/.local/bin
set -e

TARGET=~/.local/bin/pet
VERSION=0.3.6

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

if [ -x $TARGET ] && [ "$($TARGET version)" = "pet version $VERSION" ]; then
  exit 0
fi

filename=pet_${VERSION}_${ARCH}.tar.gz
curl -sSL https://github.com/knqyf263/pet/releases/download/v$VERSION/$filename -o $filename
tar xzf $filename -C $(dirname $TARGET) pet
rm $filename
echo "Installed pet version $VERSION at $TARGET"
