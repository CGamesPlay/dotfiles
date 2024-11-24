# @describe A remote environment.
set -eu
# shellcheck shell=bash
# shellcheck disable=SC1090
. "$ATENV_HELPER_LIB"

# @cmd Start the environment
up() {
	: # If anything needs to be done to start the environment, do it here.
}

# @cmd Execute a command in the environment
# @arg command! Command to run
run-in-env() {
	# Replace this with a script that runs the provided command in the
	# environment. The following is an example that would execute the command
	# locally:
	# exec sh -c "${argc_command:?}"
	echo 'Not implemented' >&2
	return 1
}

# @cmd Print the port forwarding specification
ports() {
	declare_ports <<-EOF
	ssh_agent
	EOF
}

eval "$(argc --argc-eval "$0" "$@")"
