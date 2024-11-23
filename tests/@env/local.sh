# Directly evaluate the shell script with the user's local shell.
#
# shellcheck shell=bash
set -eu

environment_up() {
	: # nothing to do
}


environment_exec() {
	"$SHELL" -c "$1"
}
