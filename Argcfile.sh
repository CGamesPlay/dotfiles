#!/usr/bin/env bash
# @describe Helper scripts for managing the dotfiles.
set -eu

# @cmd Update the git remote URL to point to the canonical one over SSH.
make-pushable() {
	git remote set-url origin git@gitlab.com:CGamesPlay/dotfiles.git
}

# @cmd Find files that maybe should be added to DFM.
find-unmanaged() {
	echo "The following files are in directories controlled by DFM, but are not themselves in DFM."
	find files -type d -not -name files \
		| sed 's/^files/'$(echo ~ | sed 's/\//\\\//g')'/' \
		| xargs -I {} find {} -maxdepth 1 -type f -not -name .DS_Store \
		| grep -vE '.local/bin/|.ssh/id_'
}

eval "$(argc --argc-eval "$0" "$@")"
