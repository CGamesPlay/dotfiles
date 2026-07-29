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
	eval "$(cat Argcfile.sh | grep -Eo '^(test::[^(]*)()' | grep -v 'test::main')"
}

# @cmd Test the prepare command
test::prepare() {
	print_header "Default arguments, single commit"
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

	print_header "Undoable in a single call"
	jj undo
	check_graph <<-EOF
	◆  (root)
	◆  [main] upstream base
	⊗  private: private commit
	○  change to push
	@  (empty)
	EOF

	print_header "Default arguments, two commits"
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

	print_header "Ambiguous bookmark is an error"
	mkrepo
	jj --quiet bookmark set staging -r main
	do_change file.txt
	jj --quiet commit -m "change to push"
	if jj prepare; then
		echo "Failure: jj prepare accepted ambiguous bookmark" >&2
		exit 1
	fi

	print_header "Using --source"
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

	print_header "Using --revisions"
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

	print_header "As a PR, single commit"
	mkrepo
	do_change file.txt
	jj --quiet commit -m "change to push"
	jj prepare --pr my-pr
	check_graph <<-EOF
	◆  (root)
	◆  [main] upstream base
	○  [my-pr] change to push
	⊗  private: private commit
	@  (empty)
	EOF
	# Add commits to the same PR
	do_change file.txt
	jj --quiet commit -m "more changes"
	jj prepare --pr my-pr
	check_graph <<-EOF
	◆  (root)
	◆  [main] upstream base
	○  change to push
	○  [my-pr] more changes
	⊗  private: private commit
	@  (empty)
	EOF
	# Make a new PR
	do_change file2.txt
	jj --quiet commit -m "another PR"
	jj prepare --pr second-pr
	check_graph <<-EOF
	◆  (root)
	◆    [main] upstream base
	|\\
	| ○  change to push
	| ○  [my-pr] more changes
	○ |  [second-pr] another PR
	|/
	⊗  private: private commit
	@  (empty)
	EOF

	print_header "As a PR, source already on trunk"
	mkrepo
	# Move the private commit to the end so the new commits sit directly on trunk
	do_change file.txt
	jj --quiet commit -m "first change"
	do_change file-2.txt
	jj --quiet commit -m "second change"
	jj --quiet rebase -r @--- -A @-
	# Now: main -- first -- second -- private -- @
	# Prepare the two commits as a PR (they already sit on trunk)
	jj prepare -r '@---::@--' --pr my-pr
	check_graph <<-EOF
	◆  (root)
	◆  [main] upstream base
	○  first change
	○  [my-pr] second change
	⊗  private: private commit
	@  (empty)
	EOF

	print_header "As a PR, extracting from middle of chain"
	mkrepo
	# Move private to end so chain is: main -- first -- second -- private -- @
	do_change file.txt
	jj --quiet commit -m "first change"
	do_change file-2.txt
	jj --quiet commit -m "second change"
	jj --quiet rebase -r @--- -A @-
	# Extract "second change" (not directly on trunk) as a PR
	jj prepare -r @-- --pr my-pr
	check_graph <<-EOF
	◆  (root)
	◆    [main] upstream base
	|\\
	| ○  first change
	○ |  [my-pr] second change
	|/
	⊗  private: private commit
	@  (empty)
	EOF
}

# @cmd Test the bisect-conflict command
test::bisect-conflict() {
	print_header "Finds the destination commit that introduces a conflict"
	mkrepo
	printf 'a\nb\nc\n' > shared.txt
	jj --quiet commit -m mbase
	echo d1 > d1.txt; jj --quiet commit -m d1
	echo d2 > d2.txt; jj --quiet commit -m d2
	printf 'a\nDEST\nc\n' > shared.txt; jj --quiet commit -m d3
	echo d4 > d4.txt; jj --quiet commit -m d4
	jj --quiet bookmark set dest -r @-
	jj --quiet new 'description(substring:"mbase")' -m src
	printf 'a\nSRC\nc\n' > shared.txt
	jj --quiet bookmark set src -r @
	# Leave @ as a descendant of the source so the rebase rewrites the
	# working-copy commit (regression: must not leave a stale working copy).
	jj --quiet new -m src2
	echo wc > wc.txt

	output=$(jj bisect-conflict -s src -o dest)
	case "$(echo "$output" | tail -n1)" in
		"The first bad revision is: "*" d3") ;;
		*)
			echo "Failure: expected first bad revision d3" >&2
			echo "$output" >&2
			exit 1
			;;
	esac
	if [[ -n "$(jj log --ignore-working-copy --no-graph -r 'conflicts()' -T 'change_id')" ]]; then
		echo "Failure: bisect-conflict left conflicts behind" >&2
		exit 1
	fi

	print_header "Finds the destination commit with the default source (-b @)"
	# Without an explicit source selector, the rebase defaults to -b @. jj bisect
	# run relocates @ to each candidate, so the replay must freeze @ to its
	# original commit instead of following it (regression: every candidate looked
	# good and the head was wrongly blamed).
	mkrepo
	printf 'a\nb\nc\n' > shared.txt
	jj --quiet commit -m mbase
	echo d1 > d1.txt; jj --quiet commit -m d1
	echo d2 > d2.txt; jj --quiet commit -m d2
	printf 'a\nDEST\nc\n' > shared.txt; jj --quiet commit -m d3
	echo d4 > d4.txt; jj --quiet commit -m d4
	jj --quiet bookmark set dest -r @-
	jj --quiet new 'description(substring:"mbase")' -m src
	printf 'a\nSRC\nc\n' > shared.txt
	jj --quiet new -m src2
	echo wc > wc.txt
	output=$(jj bisect-conflict -o dest)
	case "$(echo "$output" | tail -n1)" in
		"The first bad revision is: "*" d3") ;;
		*)
			echo "Failure: expected first bad revision d3 with default source" >&2
			echo "$output" >&2
			exit 1
			;;
	esac

	print_header "Reports when the rebase introduces no conflict"
	mkrepo
	echo d1 > d1.txt; jj --quiet commit -m d1
	jj --quiet bookmark set dest -r @-
	jj --quiet new 'trunk()' -m src
	echo s > s.txt
	jj --quiet bookmark set src -r @
	jj --quiet new dest
	output=$(jj bisect-conflict -s src -o dest)
	if [[ "$output" != "The rebase introduces no conflict." ]]; then
		echo "Failure: expected no-conflict message, got: $output" >&2
		exit 1
	fi

	print_header "Ignores a conflict that already exists in the source"
	mkrepo
	printf 'a\nb\nc\n' > shared.txt
	jj --quiet commit -m mbase
	echo d1 > d1.txt; jj --quiet commit -m d1
	jj --quiet commit -m d2
	printf 'a\nDEST\nc\n' > shared.txt; jj --quiet commit -m d3
	echo d4 > d4.txt; jj --quiet commit -m d4
	jj --quiet bookmark set dest -r @-
	# Source touches shared.txt (so d3 introduces a real conflict) but also
	# carries its own pre-existing conflict from a merge of divergent edits. The
	# pre-existing conflict must not mask the real culprit (regression: it made
	# every bisect candidate look bad).
	jj --quiet new 'description(substring:"mbase")' -m src
	printf 'a\nSRC\nc\n' > shared.txt
	jj --quiet bookmark set src -r @
	jj --quiet new src -m srcA
	printf 'A\n' > confl.txt
	jj --quiet new src -m srcB
	printf 'B\n' > confl.txt
	jj --quiet new 'description(substring:"srcA")' 'description(substring:"srcB")' -m srcmerge
	if [[ -z "$(jj log --ignore-working-copy --no-graph -r 'conflicts()' -T 'change_id')" ]]; then
		echo "Failure: test setup did not create a pre-existing conflict" >&2
		exit 1
	fi
	output=$(jj bisect-conflict -s src -o dest)
	case "$(echo "$output" | tail -n1)" in
		"The first bad revision is: "*" d3") ;;
		*)
			echo "Failure: expected first bad revision d3 despite pre-existing conflict" >&2
			echo "$output" >&2
			exit 1
			;;
	esac

	print_header "Blames the merge instead of descending into an off-path branch"
	mkrepo
	printf 'a\nb\nc\n' > shared.txt
	jj --quiet commit -m preb
	echo m > m.txt; jj --quiet commit -m mbase
	# A branch that forks before mbase and edits shared.txt. It is merged into
	# trunk after mbase, so its commits are ancestors of the destination but not
	# on any path from the merge-base. Rebasing the source onto those commits
	# conflicts too, but blaming them moves "backwards"; the merge that pulls the
	# branch in is the meaningful culprit. The merge resolves cleanly because
	# shared.txt already exists at preb, the common ancestor.
	jj --quiet new 'description(substring:"preb")' -m sidebr
	printf 'a\nSIDE\nc\n' > shared.txt
	jj --quiet new 'description(substring:"mbase")' 'description(substring:"sidebr")' -m merge
	jj --quiet new -m dest
	echo d > d.txt
	jj --quiet bookmark set dest -r @
	jj --quiet new 'description(substring:"mbase")' -m src
	printf 'a\nSRC\nc\n' > shared.txt
	jj --quiet bookmark set src -r @
	output=$(jj bisect-conflict -s src -o dest)
	case "$(echo "$output" | tail -n1)" in
		"The first bad revision is: "*" merge") ;;
		*)
			echo "Failure: expected first bad revision to be the merge commit" >&2
			echo "$output" >&2
			exit 1
			;;
	esac
}

# @cmd Test the pull command
test::pull() {
	print_header "Fetches trunk's remote and rebases onto it"
	mkremote
	jj --quiet new 'trunk()' -m "my work"
	echo change > work.txt
	advance_remote "upstream advance"
	jj pull
	check_graph <<-EOF
	◆  (root)
	◆  (empty) base
	◆  (empty) [master@origin] upstream advance
	@  my work
	EOF

	print_header "Accepts an explicit name@remote target"
	mkremote
	jj --quiet new 'trunk()' -m "my work"
	echo change > work.txt
	advance_remote "upstream advance"
	jj pull master@origin
	check_graph <<-EOF
	◆  (root)
	◆  (empty) base
	◆  (empty) [master@origin] upstream advance
	@  my work
	EOF
}

print_header() {
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

# Create a git remote seeded with a "base" commit on master, then a jj clone
# that tracks it (so trunk() resolves to master@origin). Leaves the shell in
# the jj clone and records $remote_dir for advance_remote.
mkremote() {
	if [[ ! ${root+1} ]]; then
		root=$(mktemp -d)
		if [[ ! ${JJ_NO_CLEANUP+1} ]]; then
			trap 'rm -rf "$root"' EXIT
		fi
	fi
	remote_dir=$(mktemp -d -p "$root")
	git init -q --bare "$remote_dir/remote.git"
	git init -q "$remote_dir/seed"
	(
		cd "$remote_dir/seed"
		git -c user.email=test@example.com -c user.name=test commit -q --allow-empty -m base
		git branch -M master
		git remote add origin "$remote_dir/remote.git"
		git push -q origin master
	)
	dir=$(mktemp -d -p "$root")
	if [[ ${JJ_NO_CLEANUP+1} ]]; then
		echo "Creating test repository: $dir" >&2
	fi
	jj --quiet git clone "$remote_dir/remote.git" "$dir/work"
	cd "$dir/work"
}

# Add an empty commit with the given message to the remote's master and push it.
advance_remote() {
	(
		cd "$remote_dir/seed"
		git -c user.email=test@example.com -c user.name=test commit -q --allow-empty -m "$1"
		git push -q origin master
	)
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
		echo ""
		diff -U0 <(echo "$expected") <(echo "$actual")
		exit 1
	fi
}

if ! command -v argc >/dev/null; then
	echo "This command requires argc. Install from https://github.com/sigoden/argc" >&2
	exit 100
fi
eval "$(argc --argc-eval "$0" "$@")"
