#!/bin/sh
# Install git-delta
set -e
. "$(dirname "$0")/helpers"

is_installed() {
  command -v $1 >/dev/null
}

if is_installed delta; then
  exit 0
fi

case `uname -s` in
  Darwin)
    sudo pkgin install -y git-delta less
    ;;
  Linux)
    VERSION=0.13.0
    ARCH=$(dpkg --print-architecture)
    filename=git-delta_${VERSION}_${ARCH}.deb
    url=https://github.com/dandavison/delta/releases/download/$VERSION/${filename}
    curl -fsSL $url -o $filename
    sudo dpkg -i $filename
    rm -f $filename
    ;;
  *)
    echo "Unsupported OS: `uname -s`" >&2
    kill $$
    ;;
esac
