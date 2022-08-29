#!/bin/sh
# Install the latest release of dfm to ../bin/dfm (it's kept in the repository
# folder itself, not in ~/.local/bin), and run dfm to set up the symlinks.
set -e
. "$(dirname "$0")/helpers"

DFM_DIR="$(pwd)"
DFM_ARCH=$(goos_goarch)

case `uname -s` in
  Darwin)
    REPOS="files,macos"
    ;;
  Linux)
    REPOS="files,linux"
    ;;
  *)
    echo "Unsupported system: `uname -s`" >&2
    exit 1
    ;;
esac

install_dfm() {
  local filename=$DFM_ARCH.tar.gz
  echo "Installing dfm for $DFM_ARCH"
  curl -fsSL https://github.com/cgamesplay/dfm/releases/latest/download/$filename -o $filename
  mkdir -p bin
  tar -xf $filename -C bin/
  rm $filename
}

check_deps curl tar || exit 1

if [ ! -e 'bin/dfm' ]; then
  install_dfm
fi

if [ ! -e '.dfm.toml' ]; then
  bin/dfm -d "$DFM_DIR" --repos $REPOS init
else
  echo 'dfm already initialized, skipping...'
fi

bin/dfm -d "$DFM_DIR" link
