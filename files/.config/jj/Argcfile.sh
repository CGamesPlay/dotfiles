#!/usr/bin/env bash
# @describe Implementations of jj aliases
#
# Test by running: ~/.config/jj/Argcfile.sh test
#
# @env JJ_NO_CLEANUP  Set to disable cleanup of intermediates/test repos
# @meta binname jj

set -eu

# @cmd Testing commands
test() { :; }

test::main() {
	eval "$(cat "$0" | grep -Eo '^(test::[^(]*)()' | grep -v 'test::main')"
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

# @cmd
# @arg op!
transact() {
	cd "$ARGC_PWD"
	jj_transaction
	echo 'foo' > README.md
	jj status
	echo 'bar' > README.md
	jj status
	if [[ ${argc_op:?} == "fail" ]]; then
		false
	fi
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
		destination=$(jj bookmark list "${argc_bookmark}" -T 'name')
	elif [[ ${argc_pr+1} ]]; then
		if [[ ${argc_pr:+1} && "$(jj bookmark list "$argc_pr" -T 'name')" ]]; then
			# Updating an existing PR is the same as a direct branch push to
			# that branch.
			destination="$argc_pr"
			unset argc_pr
		else
			# Creating a new PR
			destination="trunk()"
		fi
	else
		destination=$(jj log -G -r 'heads(::@ & bookmarks())' -T 'bookmarks.map(|r| r.name()).join(" ")')
	fi
	dest_count=$(echo "$destination" | wc -w)
	if [[ $dest_count -eq 0 ]]; then
		echo "Error: no bookmarks match" >&2
		exit 1
	elif [[ $dest_count -gt 1 ]]; then
		echo "Error: multiple bookmarks are available: $destination" >&2
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
	
	head=$(jj log -G --config "$prepare_branch" -r "heads($source)" -T 'change_id ++ "\n"' 2>/dev/null)

	if [[ ! "$head" ]]; then
		echo "Warning: no revisions to prepare" >&2
		exit 0
	elif [[ $(echo "$head" | wc -l) -gt 1 ]]; then
		jj log --reversed --config "$prepare_branch" -r "$source" -T log_oneline
		echo "Error: the revset has more than one head revision" >&2
		exit 1
	fi

	# This op: jj op log -GT 'id' -n 1

	if [[ ! ${argc_pr+1} ]]; then
		jj rebase --config "$prepare_branch" -r "$source" -A "$destination"
		jj bookmark set -r "$head" "$destination"
	else
		argc_pr=${argc_pr:-$(jj log -G -r "$head" -T "$(jj config get templates.git_push_bookmark)")}
		# We need to find the root of the branch that we are pulling out of,
		# then add our new branch as a parent of that commit.
		unpushed_root=$(jj log -G --config "$prepare_branch" -r "exactly(roots(..($source) ~ reachable(trunk(), ~unpushable())), 1)" -T 'change_id')
		jj rebase --config "$prepare_branch" -r "$source" -o "$destination"
		jj rebase -s "$unpushed_root" -d "$unpushed_root-" -d "$head"
		jj bookmark set -r "$head" "$argc_pr"
	fi
}

# @cmd Test the prepare command
test::prepare() {
	test::header "Default arguments, single commit"
	mkrepo
	do_change file.txt
	jj --quiet commit -m "change to push"
	jj prepare
	check_graph <<-EOF
	◆  (root)
	◆  upstream base
	◆  [main] change to push
	⊗  private: private commit
	@  (empty)
	EOF

	test::header "Undoable in a single call"
	jj undo
	check_graph <<-EOF
	◆  (root)
	◆  [main] upstream base
	⊗  private: private commit
	○  change to push
	@  (empty)
	EOF

	test::header "Default arguments, two commits"
	do_change file-2.txt
	jj --quiet commit -m "second change"
	jj prepare
	check_graph <<-EOF
	◆  (root)
	◆  upstream base
	◆  change to push
	◆  [main] second change
	⊗  private: private commit
	@  (empty)
	EOF

	test::header "Ambiguous bookmark is an error"
	mkrepo
	jj --quiet bookmark set staging -r main
	do_change file.txt
	jj --quiet commit -m "change to push"
	if jj prepare; then
		echo "Failure: jj prepare accepted ambiguous bookmark" >&2
		exit 1
	fi

	test::header "Using --source"
	mkrepo
	do_change file.txt
	jj --quiet commit -m "change to leave"
	do_change file-2.txt
	jj --quiet commit -m "change to push"
	jj prepare -s @-
	check_graph <<-EOF
	◆  (root)
	◆  upstream base
	◆  [main] change to push
	⊗  private: private commit
	○  change to leave
	@  (empty)
	EOF

	test::header "Using --revisions"
	mkrepo
	do_change file.txt
	jj --quiet commit -m "change to push"
	do_change file-2.txt
	jj --quiet commit -m "change to leave"
	jj prepare -r @--
	check_graph <<-EOF
	◆  (root)
	◆  upstream base
	◆  [main] change to push
	⊗  private: private commit
	○  change to leave
	@  (empty)
	EOF

	test::header "As a PR, single commit"
	mkrepo
	do_change file.txt
	jj --quiet commit -m "change to push"
	jj prepare --pr my-pr
	check_graph <<-EOF
	◆  (root)
	◆    [main] upstream base
	|\\
	| ○  [my-pr] change to push
	|/
	⊗  private: private commit
	@  (empty)
	EOF
	# Add commits to the same PR
	do_change file.txt
	jj --quiet commit -m "more changes"
	jj prepare --pr my-pr
	check_graph <<-EOF
	◆  (root)
	◆    [main] upstream base
	|\\
	| ○  change to push
	| ○  [my-pr] more changes
	|/
	⊗  private: private commit
	@  (empty)
	EOF
	# Make a new PR
	do_change file2.txt
	jj --quiet commit -m "another PR"
	jj prepare --pr second-pr
	check_graph <<-EOF
	◆  (root)
	◆      [main] upstream base
	+-+-.
	| | ○  change to push
	| | ○  [my-pr] more changes
	+---'
	| ○  [second-pr] another PR
	|/
	⊗  private: private commit
	@  (empty)
	EOF
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

test::header() {
	printf "\n# %s\n\n" "$1"
}

mkrepo() {
	if [[ ! ${root+1} ]]; then
		root=$(mktemp -d)
		if [[ ! ${JJ_NO_CLEANUP+1} ]]; then
			trap 'rm -rf "$root"' EXIT
		fi
	fi
	dir=$(mktemp -d -p "$root")
	if [[ ${JJ_NO_CLEANUP+1} ]]; then
		echo "Creating test repository: $dir" >&2
	fi
	cd "$dir"
	jj --quiet git init .
	do_change file.txt
	jj --quiet commit -m "upstream base"
	jj --quiet bookmark set main -r @-
	jj config set --repo 'revset-aliases."trunk()"' 'main'
	do_change private.txt
	jj --quiet commit -m "private: private commit"
}

do_change() {
	sleep 1
	echo "$(date) $RANDOM" > "$1"
}

check_graph() {
	log_template='separate(" ",
		coalesce(if(root, "(root)"), if(empty, "(empty)")),
		surround("[", "]", bookmarks),
		description
	)'
	actual=$(jj log --reversed --color=never --no-pager --config ui.graph.style=ascii -T "$log_template")
	expected=$(cat)
	if [[ "$actual" != "$expected" ]]; then
		echo "Incorrect result!"
		echo "Expected:"
		echo "$expected"
		echo ""
		echo "Actual:"
		echo "$actual"
		exit 1
	fi
}

if ! command -v argc >/dev/null; then
	echo "This command requires argc. Install from https://github.com/sigoden/argc" >&2
	exit 100
fi
eval "$(argc --argc-eval "$0" "$@")"
