# shellcheck shell=bash
#
# Executes on the remote system named $ATENV_SSH_HOST.
set -eu

environment_up() {
	: # nothing to do
}

environment_exec() {
	# shellcheck disable=SC2029
	ssh "${ATENV_SSH_HOST:?must be SSH host to test with}" "$1"
}
