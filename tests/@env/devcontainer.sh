# shellcheck shell=bash
set -eu

# Executes in the local devcontainer with the workspace stored at
# $ATENV_DEVCONTAINER.
environment_exec() {
	# The devcontainer CLI does not automatically start the user's shell. This
	# case is handled in the "@env shell" subcommand, but here we just use sh.
	npx @devcontainers/cli exec --workspace-folder="$ATENV_DEVCONTAINER" sh -c "$1"
}
