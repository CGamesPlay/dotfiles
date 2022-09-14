#!/bin/sh
# Install cargo-binstall
# https://github.com/cargo-bins/cargo-binstall
set -e
. "$(dirname "$0")/helpers"

if is_installed cargo-binstall; then
  exit 0
fi

case `uname -s` in
  Linux)
    filename=cargo-binstall-$(uname -m)-unknown-linux-musl.tgz
    url=https://github.com/cargo-bins/cargo-binstall/releases/latest/download/${filename}
    curl -fsSL $url -o $filename
    tar xf $filename -C ~/.local/bin
    rm $filename
    ;;
  *)
    echo "Unsupported OS: `uname -s`" >&2
    kill $$
    ;;
esac
