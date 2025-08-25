#!/usr/bin/env bash
# @describe Helper scripts for managing the dotfiles.
set -eu

# @cmd Pull the latest verison and sync
# @flag      --bootstrap Run the bootstrap script.
pull() {
	# Get the current commit hash before pulling
	before_commit=$(git rev-parse HEAD)

	git pull
	dfm link

	# Get the new commit hash after pulling
	after_commit=$(git rev-parse HEAD)

	if [[ "${argc_bootstrap:+1}" ]]; then
		./bootstrap.sh

	elif [[ "$before_commit" != "$after_commit" ]]; then
		# Get list of modified files between the commits
		modified_files=$(git diff --name-only "$before_commit" "$after_commit")

		# Check if any files in tasks directory were modified
		tasks_modified=$(echo "$modified_files" | grep -E '^tasks/' || true)

		if [[ -n "$tasks_modified" && ! "${argc_bootstrap:+1}" ]]; then
			echo -e "\033[1;33m" >&2
			echo "WARNING: Files in the 'tasks' directory have been modified!" >&2
			echo "Modified task files:" >&2
			# shellcheck disable=SC2001
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
	if [ "$(git log -1 --pretty=format:"%G?" 2>/dev/null)" == "N" ]; then
		git commit --amend -C HEAD -S
	fi
	git push git@gitlab.com:CGamesPlay/dotfiles.git master --force-with-lease=master:origin/master
	git fetch origin
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
