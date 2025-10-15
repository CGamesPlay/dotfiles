#!/usr/bin/env bash
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

# @cmd Show server status
status() {
	ssh "${ATENV_SSH_HOST:?must be SSH host to test with}" echo "up"
}

# @cmd Shut down the server
stop() {
	: # nothing to do
}

eval "$(argc --argc-eval "$0" "$@")"
