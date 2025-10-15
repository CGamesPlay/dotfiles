# @describe Executes in the remote devcontainer with the workspace stored at
# $ATENV_SSH_DEVCONTAINER on the remote system named $ATENV_SSH_HOST.
set -eu
# shellcheck shell=bash
# shellcheck disable=SC1090
. "$ATENV_HELPER_LIB"

# @cmd Start the environment
# @flag --rebuild Delete any existing container and rebuild.
up() {
	@env up ssh
	@env exec ssh \
		npx @devcontainers/cli up \
		--workspace-folder="${ATENV_SSH_DEVCONTAINER:?must be path on remote to devcontainer workspace folder}" \
		${argc_rebuild+--remove-existing-container}
}

# @cmd Execute a command in the environment
# @arg command! Command to run
run-in-env() {
	# The devcontainer CLI does not automatically start the user's shell. This
	# case is handled in the "@env shell" subcommand, but here we just use sh.
	@env exec ssh \
		npx @devcontainers/cli exec \
		--workspace-folder="$ATENV_SSH_DEVCONTAINER" \
		-- sh -c "$1"
}

# @cmd Show devcontainer status
status() {
	@env exec ssh \
		npx @devcontainers/cli exec \
		--workspace-folder="$ATENV_SSH_DEVCONTAINER" \
		-- echo "up"
}

# @cmd Shut down the devcontainer
stop() {
	echo "@devcontainers/cli doesn't provide this functionality" >&2
	exit 1
}

eval "$(argc --argc-eval "$0" "$@")"
