#!/bin/bash

set -ueo pipefail
ATENV_HOME=$(dirname "${BASH_SOURCE[0]}")/@env
export ATENV_HOME

while IFS= read -r; do
	TEST_ENVS+=("$REPLY")
done < <(@env list)
[[ ${REPLY:+1} ]] && TEST_ENVS+=("$REPLY")

_test_in_env() {
	local env=$1

	@env up "$env" || return 1

	echo "Test exec with spaces"
	actual="$(@env exec "$env" sh -c "echo 'a b c'" 2>&1)"
	expected="a b c"
	diff -u <(printf '%s\n' "$actual") <(printf '%s\n' "$expected") || return 1

	echo "Test exec with newlines"
	actual="$(@env exec "$env" sh -c "echo '$(printf 'a\nb')'" 2>&1)"
	expected="$(printf 'a\nb\n')"
	diff -u <(printf '%s\n' "$actual") <(printf '%s\n' "$expected") || return 1

	echo "Test exec with process substitution"
	actual="$(@env exec "$env" sh -c "echo \$(echo 1)" 2>&1)"
	expected="1"
	diff -u <(printf '%s\n' "$actual") <(printf '%s\n' "$expected") || return 1

	echo "Test exec with multiple commands"
	actual="$(@env exec "$env" sh -c "cd /tmp; pwd" 2>&1)"
	expected="/tmp"
	diff -u <(printf '%s\n' "$actual") <(printf '%s\n' "$expected") || return 1
}

# Test runner
run_tests() {
	local test_fail=0
	tests=("${TEST_ENVS[@]}")
	if [[ $# -gt 0 ]]; then
		tests=("$@")
	fi
	for test in "${tests[@]}"; do
		local status=0
		echo "$test..." >&2
		_test_in_env "$test" || status=$?
		if [ "$status" -ne 0 ]; then
			echo "Test failed: $test" >&2
			test_fail=1
		fi
	done
	return $test_fail
}

# Execute the test runner
failures=0
run_tests "$@" || failures=$?
if [ "$failures" -ne 0 ]; then
	echo "Some tests failed."
	exit "$failures"
else
	echo "All tests passed."
fi

