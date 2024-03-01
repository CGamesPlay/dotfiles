# shellcheck shell=bash
set -eu

# Executes on the remote system named $ATENV_SSH_HOST.
environment_exec() {
	# shellcheck disable=SC2029
	ssh "$ATENV_SSH_HOST" "$1"
}
