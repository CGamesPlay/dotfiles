# shellcheck shell=bash
set -eu

# We want to directly evaluate the shell script with the user's local shell.
environment_exec() {
	"$SHELL" -c "$1"
}
