#!/bin/bash
set -e

DFM_DIR="$(dirname "$0")"

case `uname -s` in
  Darwin)
    DFM_VERSION=darwin_amd64
    ;;
  Linux)
    DFM_VERSION=linux_amd64
    ;;
  *)
    echo "Unsupported system: `uname -s`" >&2
    exit 1
    ;;
esac

function check_deps() {
  local deps
  deps="curl tar"
  for dep in $deps; do
    if ! hash $dep 2>/dev/null; then
      echo "$dep: Command not found" >&2
      echo "The following must be installed first: $deps" >&2
      exit 1
    fi
  done
}

function install_dfm() {
  local filename=$DFM_VERSION.tar.gz
  echo "Installing dfm for $DFM_VERSION"
  curl -sSL https://github.com/cgamesplay/dfm/releases/latest/download/$filename -o $filename
  mkdir -p bin
  tar -xf $filename -C bin/
  rm $filename
}

check_deps || exit 1

if [ ! -e 'bin/dfm' ]; then
  install_dfm
fi

if [ ! -e '.dfm.toml' ]; then
  bin/dfm -d "$DFM_DIR" --repos files init
else
  echo 'dfm already initialized, skipping...'
fi

bin/dfm -d "$DFM_DIR" link
./run_tasks.sh
