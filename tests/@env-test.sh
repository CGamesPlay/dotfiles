#!/bin/bash

set -ueo pipefail
ATENV_HOME=$(dirname "${BASH_SOURCE[0]}")/@env
export ATENV_HOME

_test_in_env() {
	local env=$1

	echo test 1
	# Test with spaces
	actual="$(@env execute "$env" sh -c "echo 'a b c'" 2>&1)"
	expected="a b c"
	diff -u <(printf '%s\n' "$actual") <(printf '%s\n' "$expected") || return 1

	echo test 2
	# Test with newlines
	actual="$(@env execute "$env" sh -c "echo '$(printf 'a\nb')'" 2>&1)"
	expected="$(printf 'a\nb\n')"
	diff -u <(printf '%s\n' "$actual") <(printf '%s\n' "$expected") || return 1

	echo test 3
	# Test with process substitution
	actual="$(@env execute "$env" sh -c "echo \$(echo 1)" 2>&1)"
	expected="1"
	diff -u <(printf '%s\n' "$actual") <(printf '%s\n' "$expected") || return 1

	echo test 4
	actual="$(@env execute "$env" sh -c "cd /tmp; pwd" 2>&1)"
	expected="/tmp"
	diff -u <(printf '%s\n' "$actual") <(printf '%s\n' "$expected") || return 1
}

test_local() {
	_test_in_env local
}

test_ssh() {
	_test_in_env ssh
}

test_devcontainer() {
	_test_in_env devcontainer
}

test_ssh_devcontainer() {
	_test_in_env ssh_devcontainer
}

# Test runner
run_tests() {
	local test_fail=0
	for test in $(declare -F | awk '{print $3}' | grep '^test_'); do
		local status=0
		echo "$test..." >&2
		$test || status=$?
		if [ "$status" -ne 0 ]; then
			echo "Test failed: $test" >&2
			test_fail=1
		fi
	done
	return $test_fail
}

# Execute the test runner
failures=0
run_tests || failures=$?
if [ "$failures" -ne 0 ]; then
	echo "Some tests failed."
	exit "$failures"
else
	echo "All tests passed."
fi

