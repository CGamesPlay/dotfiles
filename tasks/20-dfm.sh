#!/bin/sh
# Install the latest release of dfm to ../bin/dfm (it's kept in the repository
# folder itself, not in ~/.local/bin), and run dfm to set up the symlinks.
set -e
. "$(dirname "$0")/helpers"

DFM_DIR="$(pwd)"

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
	bin/dfm -d "$DFM_DIR" --repos $REPOS init
else
	echo 'dfm already initialized, skipping...'
fi

bin/dfm -d "$DFM_DIR" link
