# @describe Executes in the local devcontainer with the workspace stored at
# $ATENV_DEVCONTAINER.
set -eu
# shellcheck shell=bash
# shellcheck disable=SC1090
. "$ATENV_HELPER_LIB"

# @cmd Start the environment
# @flag --rebuild Delete any existing container and rebuild.
up() {
	npx @devcontainers/cli up --workspace-folder="$ATENV_DEVCONTAINER" \
		${argc_rebuild+--remove-existing-container}
}

# @cmd Execute a command in the environment
# @arg command! Command to run
run-in-env() {
	# The devcontainer CLI does not automatically start the user's shell. This
	# case is handled in the "@env shell" subcommand, but here we just use sh.
	npx @devcontainers/cli exec --workspace-folder="$ATENV_DEVCONTAINER" -- sh -c "$1"
}

eval "$(argc --argc-eval "$0" "$@")"
