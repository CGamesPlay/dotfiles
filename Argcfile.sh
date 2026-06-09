#!/usr/bin/env bash
# @describe Helper scripts for managing dotfiles.
set -eu

# @cmd Open an editor in the dotfiles directory
edit() {
	neovide
}

# @cmd Show jj status
status() {
	jj
}

# @cmd Pull the latest verison and sync
# @flag      --bootstrap Run the bootstrap script.
pull() {
	if [[ ! -d .jj ]]; then
		./tasks/90-jj.sh
	fi

	# Update git remote
	jj git fetch --quiet
	# Check signature on new leaf
	local sig=$(jj log -r master@origin -GT 'signature.status()')
	if [[ "$sig" != "good" ]]; then
		jj show --no-pager --no-patch master@origin
		echo "$sig signature on master@origin" >&2
		exit 1
	fi

	# Get the current commit hash before rebasing
	before_commit=$(jj log -r @ -GT 'commit_id')

	# Rebase current commits on top
	jj rebase -d master --quiet

	# If the previous rebase resulted in a merge conflict on a jj config
	# file, it will prevent jj from starting, so we won't be able to undo the
	# changes. So we will bypass the jj config for this step.
	export JJ_CONFIG=
	
	if [[ "$(jj log -r @ -GT 'conflict')" == "true" ]]; then
		jj status
		echo "" >&2
		echo "Failed to update" >&2
		jj undo
		exit 1
	fi

	# Restore jj config
	unset JJ_CONFIG

	# Get the new commit hash after rebasing
	after_commit=$(jj log -r @ -GT 'commit_id')

	if [[ "${DFM_DIR+1}" ]]; then
		dfm link
	fi

	if [[ "$before_commit" != "$after_commit" ]]; then
		jj --no-pager l -r "$before_commit..@" --reversed
	else
		echo "No new changes"
	fi
	jj default-status

	if [[ "${argc_bootstrap:+1}" ]]; then
		./bootstrap.sh

	elif [[ "$before_commit" != "$after_commit" ]]; then
		# Get list of modified files between the commits
		modified_files=$(jj diff --name-only --from "$before_commit" --to "$after_commit")

		# Check if any files in tasks directory were modified
		tasks_modified=$(echo "$modified_files" | grep -E '^tasks/' || true)

		if [[ -n "$tasks_modified" && ! "${argc_bootstrap:+1}" ]]; then
			echo -e "\033[1;33m" >&2
			echo "WARNING: Files in the 'tasks' directory have been modified!" >&2
			echo "Modified task files:" >&2
			echo "$tasks_modified" | sed 's/^/    /' >&2
			echo >&2
			echo "To fully update: @argc dotfiles pull --bootstrap" >&2
			echo -e "\033[0m" >&2
		fi
	fi
}

# @cmd Push the changes to the repository.
#
# This amends the latest commit to sign it, and uses --force-with-lease
push() {
	# JJ does not support automatically detecting the ssh key
	# https://github.com/jj-vcs/jj/issues/6688
	jj config set --repo signing.key "$(ssh-add -L | tail -1)"

	local sig
	sig=$(jj log -r master -GT 'signature.status()')
	if [[ "$sig" != "good" ]]; then
		jj --quiet sign -r master
	fi

	jj git export
	GITDIR=$(jj git root)
	git --git-dir "$GITDIR" push git@gitlab.com:CGamesPlay/dotfiles.git master --force-with-lease=master:origin/master
	git --git-dir "$GITDIR" fetch origin
	jj git import
}

# @cmd Find files that maybe should be added to DFM.
find-unmanaged() {
	echo "The following files are in directories controlled by DFM, but are not themselves in DFM."
	find files -type d -not -name files \
		| sed "s@^files@$HOME@" \
		| xargs -I {} find {} -maxdepth 1 -type f -not -name .DS_Store \
		| grep -vE '.local/bin/|.ssh/id_'
}

eval "$(argc --argc-eval "$0" "$@")"
