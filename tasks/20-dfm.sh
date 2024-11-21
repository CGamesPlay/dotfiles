#!/bin/sh
# Run dfm to set up the symlinks.
set -e
. "$(dirname "$0")/helpers"

DFM_DIR="$(pwd)"
export PATH="$PATH:$HOME/.local/bin"

case $(uname -s) in
	Darwin)
		REPOS="files,macos"
		;;
	Linux)
		REPOS="files,linux"
		;;
	*)
		echo "Unsupported system: $(uname -s)" >&2
		exit 1
		;;
esac

if [ ! -e '.dfm.toml' ]; then
	dfm -d "$DFM_DIR" --repos $REPOS init
else
	echo 'dfm already initialized, skipping...'
fi

dfm -d "$DFM_DIR" link
