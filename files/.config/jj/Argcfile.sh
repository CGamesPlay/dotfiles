#!/usr/bin/env bash
# @describe Implementations of jj aliases
#
# Test by running: ~/.config/jj/test.sh
#
# @env JJ_NO_CLEANUP  Set to disable cleanup of intermediates/test repos
# @meta binname jj

set -eu

# @cmd Sync the list of aliases
#
# Always writes to ~/.config/jj/conf.d/aliases.toml.
sync-aliases() {
	(
		echo '[aliases]'
		while read -r alias; do
			echo "$alias" >&2
			echo "$alias = [\"util\", \"exec\", \"--\", \"sh\", \"-c\", 'exec \"\$HOME/.config/jj/Argcfile.sh\" $alias \"\$@\"', \"\"]"
		done
	) > ~/.config/jj/conf.d/aliases.toml < <(argc --argc-compgen fish "" "argc" "" | sed -rn '/^sync-aliases|^test|^help/!{s/\t.*//;p;}')
}

# Calling this will make the rest of the script appear as a single jj
# operation. It works by recording the starting operation, then at exit,
# erasing all intermediate operations that took place. The result is that `jj
# undo` will undo the entire script's effect.
#
# If the script fails, it restores the repository to the original
# state. Unfortunately, there doesn't appear to be a way to get the op log to
# a pristine before-running state: it will always include an extra "restore
# to operation" entry. If we were to remove the intermediate entries between
# this and the restored entry, it would break `jj undo`, so we don't bother
# doing that in this case.
jj_transaction() {
	before_op=$(jj op log -GT 'id' -n 1)
	trap 'if [[ $? -ne 0 ]]; then jj --quiet op restore "$before_op"; else jj --quiet op abandon "$before_op..@-"; fi' EXIT
}

# @cmd Prepare revisions to push to a remote branch
#
# This will rebase revisions given with -s/-b/-r to come before any
# unpushable commits and after the nearest bookmark, then update the bookmark
# to include them. A bookmark name may optionally be given to use instead of
# using the nearest one.
#
# When preparing as a PR, it instead creates a separate bookmark and merges
# back into the history.
# @option -s --source <REVSET>     Move a revision and its descendants
# @option -b --branch <REVSET>     Move all pushable revisions reachable from a revision
# @option -r --revisions <REVSET>  Move a revision excluding its descendants
# @option    --pr <NAME?>          Prepare as a PR, name is optional
# @arg    bookmark                 Specific bookmark to target
prepare() {
	cd "$JJ_WORKSPACE_ROOT"
	jj_transaction

	prepare_branch="revset-aliases.'prepare_branch(dest, x)'=reachable(x, dest.. ~ unpushable() | x) ~ unpushable()"

	if ! [[ ${argc_source+1} || ${argc_branch+1} || ${argc_revisions+1} ]]; then
		argc_branch="@"
	fi

	if [[ ${argc_bookmark+1} ]]; then
		destination=("$argc_bookmark")
	elif [[ ${argc_pr+1} ]]; then
		# jj bookmark list will always exit 0, but if stdout is not a tty it
		# will empty an empty string for involid bookmarks
		if [[ ${argc_pr:+1} && "$(jj bookmark list "$argc_pr" -T 'name')" ]]; then
			# Updating an existing PR is the same as a direct branch push to
			# that branch.
			destination=("$argc_pr")
			unset argc_pr
		else
			# Creating a new PR
			destination=("trunk()")
		fi
	else
		destination=($(jj log -G -r 'heads(::@ & bookmarks() ~ unpushable())' -T 'bookmarks.map(|r| r.name()).join(" ") ++ " "'))
	fi
	if [[ ${#destination[@]} -eq 0 ]]; then
		echo "Error: no bookmarks match" >&2
		exit 1
	elif [[ ${#destination[@]} -gt 1 ]]; then
		echo "Error: multiple bookmarks are available: ${destination[@]}" >&2
		exit 1
	fi

	if [[ ${argc_source+x}${argc_branch+x}${argc_revisions+x} != "x" ]]; then
		echo "Only one of -s/-b/-r is permitted" >&2
		exit 1
	elif [[ ${argc_source+1} ]]; then
		source="($argc_source).. ~ unpushable() | ($argc_source)"
	elif [[ ${argc_branch+1} ]]; then
		source="prepare_branch($destination, $argc_branch)"
	else
		source="${argc_revisions:?}"
	fi

	head=$(jj log -G --config "$prepare_branch" -r "heads($source)" -T 'change_id ++ "\n"' 2>/dev/null) || true

	if [[ ! "$head" ]]; then
		echo "Warning: no revisions to prepare" >&2
		exit 0
	elif [[ $(echo "$head" | wc -l) -gt 1 ]]; then
		jj log --reversed --config "$prepare_branch" -r "$source" -T log_oneline
		echo "Error: the revset has more than one head revision" >&2
		exit 1
	fi

	if [[ ! ${argc_pr+1} ]]; then
		jj rebase --config "$prepare_branch" -r "$source" -A "$destination"
		jj bookmark set -r "$head" "$destination"
	else
		argc_pr=${argc_pr:-$(jj log -G -r "$head" -T "$(jj config get templates.git_push_bookmark)")}
		# We need to find the root of the branch that we are pulling out of,
		# then add our new branch as a parent of that commit.
		unpushed_root=$(jj log -G --config "$prepare_branch" -r "roots(..($source) ~ reachable(trunk(), ~unpushable()))" -T 'change_id' 2>/dev/null || true)
		if [[ -n "$unpushed_root" ]]; then
			unpushed_count=$(echo "$unpushed_root" | wc -l)
			if [[ $unpushed_count -gt 1 ]]; then
				echo "Error: multiple unpushed roots found" >&2
				exit 1
			fi
			# Pull the source out of the history and rebase the remaining
			# commits to also descend from the PR head.
			jj rebase --config "$prepare_branch" -r "$source" -o "$destination"
			jj rebase -s "$unpushed_root" -d "$unpushed_root-" -d "$head" --simplify-parents
		elif [[ -n "$(jj log -G --config "$prepare_branch" -r "roots($source) ~ children($destination)" -T 'change_id' 2>/dev/null || true)" ]]; then
			# Source is reachable from trunk but not directly on it (there
			# are non-source commits in between). Extract, move to trunk,
			# and reconnect the remaining chain via merge topology.
			next=$(jj log -G --config "$prepare_branch" -r "children($head) & ::@" -T 'change_id' 2>/dev/null || true)
			jj rebase --config "$prepare_branch" -r "$source" -o "$destination"
			if [[ -n "$next" ]]; then
				jj rebase -s "$next" -d "$next-" -d "$head" --simplify-parents
			fi
		fi
		jj bookmark set -r "$head" "$argc_pr"
	fi
}

# @cmd Open the web repo associated with this repository
# @arg remote[?`_choice_remote`]  Remote to open (default: upstream or origin)
web() {
	cd "$JJ_WORKSPACE_ROOT"
	if [[ ${argc_remote+1} ]]; then
		remote="$argc_remote"
	elif git remote get-url upstream >/dev/null 2>&1; then
		remote="upstream"
	else
		remote="origin"
	fi
	git remote get-url "$remote" | sed -r \
		-e 's$git@gitlab.com:$https://gitlab.com/$' \
		-e 's$git@github.com:$https://github.com/$' \
		-e 's$ssh://(git@)?([^:]+)(:[0-9]+)?/$https://\2/$' \
		| xargs $(which open || which xdg-open)
}

_choice_remote() {
	git -C "${ARGC_PWD:-$PWD}" remote
}

# @cmd Check out a Github PR
# @option --remote  Name of remote [default: origin or upstream]
# @arg id!     Pull request ID
gh-pr() {
	cd "$JJ_WORKSPACE_ROOT"
	if [[ ${argc_remote+1} ]]; then
		remote="$argc_remote"
	elif git remote get-url upstream >/dev/null 2>&1; then
		remote="upstream"
	else
		remote="origin"
	fi
	git fetch "$remote" "+refs/pull/${argc_id:?}/head:pr-$argc_id"
	jj new "pr-$argc_id"
	jj l -r "trunk()..pr-$argc_id"
}

# @cmd Bisect a rebase to find the commit that introduces a conflict
#
# Takes the same arguments as `jj rebase`. It runs the rebase once to discover
# which commits move and where they land, then binary-searches the destination's
# history (merge-base..destination) for the first commit that makes the rebase
# conflict. The output matches `jj bisect run`. The repository is left unchanged.
# @arg rebase_args~[?`_choice_rebase_args`]  Arguments to pass to `jj rebase` (e.g. -s foo -o bar)
bisect-conflict() {
	cd "$JJ_WORKSPACE_ROOT"

	# Every jj call below uses --ignore-working-copy so the on-disk working copy
	# is never touched, even when @ is part of the rebased set. Its recorded
	# operation therefore stays put, so restoring to before_op leaves no stale
	# working copy.
	before_op=$(jj op log --ignore-working-copy --no-graph -T 'id' -n 1)
	trap 'jj --quiet op restore --ignore-working-copy "$before_op"; jj --quiet op abandon "$before_op..@-"' EXIT

	# A commit is "moved" iff its commit_id changes as a direct result of the
	# rebase. jj rebase can only rewrite mutable commits, so snapshotting
	# mutable() before and after is an exhaustive scan; unchanged commits are
	# filtered out by the id comparison. The conflict flag is recorded too so we
	# can tell apart conflicts the rebase introduces from ones already present.
	snapshot() {
		jj log --ignore-working-copy --no-graph -r 'mutable()' \
			-T 'change_id ++ "=" ++ commit_id ++ "=" ++ if(conflict, "C", "") ++ "\n"' | sort
	}
	before=$(snapshot)
	if ! rebase_out=$(jj rebase --ignore-working-copy "${argc_rebase_args[@]:?}" 2>&1); then
		echo "$rebase_out" >&2
		exit 1
	fi
	after=$(snapshot)

	# Intersecting the changed lines' change_ids with those present before
	# excludes any brand-new commits, leaving only the rewritten ones.
	moved=$(comm -13 <(echo "$before") <(echo "$after") | sed 's/=.*//' | sort -u \
		| comm -12 - <(echo "$before" | sed 's/=.*//' | sort -u))
	if [[ -z "$moved" ]]; then
		echo "Nothing was rebased." >&2
		exit 1
	fi
	moved_revset=$(echo "$moved" | paste -sd'|' -)

	# Conflicts already present before the rebase (e.g. a conflicted merge inside
	# the source) propagate to every rebase landing spot, so counting them would
	# make every candidate look bad. Subtract that baseline to detect only the
	# conflicts the rebase itself introduces.
	#
	# Each change_id is wrapped in present() because a commit may not survive
	# every candidate's rebase (e.g. an empty commit abandoned onto some
	# destinations); without present() the revset would error on the missing id
	# and the candidate would be wrongly judged.
	moved_present=$(echo "$moved" | sed 's/^/present(/; s/$/)/' | paste -sd'|' -)
	conflict_check="conflicts() & ($moved_present)"
	baseline=$(echo "$before" | awk -F= '$3 == "C" { print $1 }' \
		| sed 's/^/present(/; s/$/)/' | paste -sd'|' -)
	if [[ -n "$baseline" ]]; then
		conflict_check="($conflict_check) ~ ($baseline)"
	fi

	if [[ -z "$(jj log --ignore-working-copy --no-graph -r "$conflict_check" -T 'change_id')" ]]; then
		echo "The rebase introduces no conflict."
		exit 0
	fi

	# Where the source landed. Computed before restoring so it reflects the
	# post-rebase positions; restoring then returns the source to its original
	# location so the merge-base below is correct.
	dest=$(jj log --ignore-working-copy --no-graph \
		-r "parents(roots($moved_revset)) ~ ($moved_revset)" \
		-T 'change_id ++ "\n"' | paste -sd'|' -)
	jj --quiet op restore --ignore-working-copy "$before_op"

	# Computed after restoring so the source roots sit at their original location
	# and the merge-base against dest below is correct.
	roots=$(jj log --ignore-working-copy --no-graph -r "roots($moved_revset)" \
		-T 'change_id ++ "\n"' | paste -sd'|' -)

	# Bisect only commits on a directed path from the merge-base to the
	# destination (the DAG range), not every ancestor of the destination. A
	# branch that forks before the merge-base and merges into the destination's
	# history afterwards is an ancestor of the destination but not on any path
	# from the merge-base; rebasing onto such a commit moves "backwards" and
	# breaks bisect's monotonicity assumption. Restricting to the DAG range keeps
	# the merge that pulls the branch in (it is on the path) as a candidate, so it
	# can be reported as the first bad revision, while excluding the off-path
	# commits. The merge-base itself is the good baseline, so subtract it.
	mergebase="heads(::($roots) & ::($dest))"
	range="(($mergebase)::($dest)) ~ ($mergebase)"

	# Each candidate is tested by replaying the user's exact rebase with only the
	# destination swapped for the candidate. Reconstructing the move ourselves
	# (e.g. with -r or -s on the discovered roots) can rebase a different set of
	# commits than the original did, leaving conflict_check referencing change_ids
	# that no longer exist. Substituting the destination keeps the replay
	# identical to discovery, so the same commits move every time.
	#
	# jj bisect run relocates @ to each candidate before invoking the command, so
	# any source selector that resolves @ (including the default -b @) would no
	# longer name the original source during the replay. Freeze @ to the source's
	# original commit_id, captured here while @ still sits at its real position,
	# and inject an explicit -b when the user relied on the default.
	original_wc=$(jj log --ignore-working-copy --no-graph -r '@' -T 'commit_id')
	rebase_template_args=()
	expect_dest=0
	expect_source=0
	saw_source=0
	for arg in "${argc_rebase_args[@]}"; do
		if (( expect_dest )); then
			rebase_template_args+=("__BISECT_TARGET__")
			expect_dest=0
			continue
		fi
		if (( expect_source )); then
			[[ "$arg" == "@" ]] && arg=$original_wc
			rebase_template_args+=("$arg")
			expect_source=0
			continue
		fi
		case "$arg" in
		-o | --onto | -A | --insert-after | -B | --insert-before)
			rebase_template_args+=("$arg")
			expect_dest=1 ;;
		--onto=* | --insert-after=* | --insert-before=*)
			rebase_template_args+=("${arg%%=*}=__BISECT_TARGET__") ;;
		-o* | -A* | -B*)
			rebase_template_args+=("${arg:0:2}__BISECT_TARGET__") ;;
		-s | --source | -b | --branch | -r | --revisions)
			saw_source=1
			rebase_template_args+=("$arg")
			expect_source=1 ;;
		--source=* | --branch=* | --revisions=*)
			saw_source=1
			val=${arg#*=}
			[[ "$val" == "@" ]] && val=$original_wc
			rebase_template_args+=("${arg%%=*}=$val") ;;
		-s* | -b* | -r*)
			saw_source=1
			val=${arg:2}
			[[ "$val" == "@" ]] && val=$original_wc
			rebase_template_args+=("${arg:0:2}$val") ;;
		*)
			rebase_template_args+=("$arg") ;;
		esac
	done
	if (( ! saw_source )); then
		rebase_template_args=(-b "$original_wc" "${rebase_template_args[@]}")
	fi

	# Set BISECT_CONFLICT_DEBUG=1 to trace the discovered move and each
	# candidate's verdict, distinguishing skipped (unrebaseable) candidates from
	# ones that genuinely conflict.
	if [[ -n "${BISECT_CONFLICT_DEBUG:-}" ]]; then
		{
			echo "DEBUG moved=$moved_revset"
			echo "DEBUG roots=$roots"
			echo "DEBUG dest=$dest"
			echo "DEBUG range=$range"
			echo "DEBUG conflict_check=$conflict_check"
			echo "DEBUG rebase_template=${rebase_template_args[*]}"
		} >&2
	fi

	# shellcheck disable=SC2016
	jj bisect run --ignore-working-copy --range "$range" -- bash -c '
		set -e
		conflict_check=$1
		debug=$2
		shift 2
		args=()
		for a in "$@"; do
			[ "$a" = "__BISECT_TARGET__" ] && a=$JJ_BISECT_TARGET
			args+=("$a")
		done
		op=$(jj op log --ignore-working-copy --no-graph -T id -n 1)
		# A candidate the source cannot be rebased onto is inconclusive, not bad:
		# exit 125 so jj bisect skips it instead of blaming it for the conflict.
		if ! out=$(jj rebase --ignore-working-copy "${args[@]}" 2>&1); then
			[ -n "$debug" ] && echo "DEBUG skip $JJ_BISECT_TARGET: $out" >&2
			jj op restore --ignore-working-copy "$op" >/dev/null 2>&1
			exit 125
		fi
		conflicted=$(jj log --ignore-working-copy --no-graph -r "$conflict_check" -T change_id)
		[ -n "$debug" ] && echo "DEBUG $JJ_BISECT_TARGET conflicted=[$conflicted]" >&2
		jj op restore --ignore-working-copy "$op" >/dev/null 2>&1
		test -z "$conflicted"
	' bash "$conflict_check" "${BISECT_CONFLICT_DEBUG:-}" "${rebase_template_args[@]}"
}

# Complete rebase_args by deferring to jj's own rebase completion. argc runs
# this function from the Argcfile's directory (~/.config/jj, which is not a jj
# repo), so cd back to $ARGC_PWD (the directory the user ran jj from) first.
# jj's completion parser expects the leading "jj" program name, and
# argc_rebase_args already ends with the token currently being completed (empty
# if a space was just typed), so this reproduces exactly what `jj rebase
# <args><Tab>` shows.
_choice_rebase_args() {
	( cd "${ARGC_PWD:-$PWD}" && COMPLETE=fish jj -- jj rebase "${argc_rebase_args[@]}" )
}

# @cmd Make a directory
#
# @flag -i --ignored  Contents and existence are ignored
# @flag -k --keep     Contents are ignored, but directory itself is tracked
# @flag -p --parents  Make parent directories as well
# @arg  path <DIR>    Path to create directory at
mkdir() {
	cd "$ARGC_PWD"
	if [[ ${argc_ignored+1} && ${argc_keep+1} ]]; then
		echo "--ignored and --keep are mutually exclusive" >&2
		exit 1
	fi
	command mkdir ${argc_parents+-p} "${argc_path:?}"
	# Make the directory ignored
	if [[ ${argc_keep+1} || ${argc_ignored+1} ]]; then
		if [[ ${argc_keep+1} ]]; then
			printf '*\n!.gitignore\n' > "${argc_path:?}/.gitignore"
		else
			echo '*' > "${argc_path:?}/.gitignore"
		fi

		# Untrack any files that already exist in the directory
		find "${argc_path:?}" -maxdepth 1 -mindepth 1 -not -name '.gitignore' -print0 | \
			xargs -r0 jj file untrack
	fi
}

# @cmd Untrack merged bookmarks
# @flag -n --dry-run  List bookmarks but don't untrack them
untrack-merged() {
	cd "$ARGC_PWD"
	bookmarks=($(jj log -G -r '::trunk()- & tracked_remote_bookmarks()' -T 'local_bookmarks.join(" ") ++ " "'))
	if [[ ! ${bookmarks+1} ]]; then
		echo "No bookmarks to untrack"
	elif [[ ${argc_dry_run+1} ]]; then
		echo "${bookmarks[@]}"
	else
		jj bookmark untrack "${bookmarks[@]}"
	fi
}

if ! command -v argc >/dev/null; then
	echo "This command requires argc. Install from https://github.com/sigoden/argc" >&2
	exit 100
fi
eval "$(argc --argc-eval "$0" "$@")"
