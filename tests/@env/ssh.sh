# @describe Executes on the remote system named $ATENV_SSH_HOST.
set -eu
# shellcheck shell=bash
# shellcheck disable=SC1090
. "$ATENV_HELPER_LIB"

# @cmd Start the environment
up() {
	: # nothing to do
}

# @cmd Execute a command in the environment
# @arg command! Command to run
run-in-env() {
	# shellcheck disable=SC2029
	ssh "${ATENV_SSH_HOST:?must be SSH host to test with}" "$1"
}

eval "$(argc --argc-eval "$0" "$@")"
