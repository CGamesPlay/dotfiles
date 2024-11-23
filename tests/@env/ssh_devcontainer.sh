# Executes in the local devcontainer with the workspace stored at
# $ATENV_SSH_DEVCONTAINER, which is on the $ATENV_SSH_HOST machine.
# 
# shellcheck shell=bash
set -eu

environment_up() {
	@env up ssh
	@env execute ssh npx @devcontainers/cli up --workspace-folder="$ATENV_DEVCONTAINER"
}

environment_exec() {
	@env execute ssh npx @devcontainers/cli exec --workspace-folder="$ATENV_SSH_DEVCONTAINER" sh -c "$1"
}
