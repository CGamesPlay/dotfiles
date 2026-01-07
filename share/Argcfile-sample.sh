#!/usr/bin/env bash
# @describe Example Argcfile
# Arguments, options, and flags listed here apply to the main command and all
# subcommands.
#
# For more information about argc, see https://github.com/sigoden/argc
# @option    --name  Name to greet

set -eu

main() {
	echo "Hello, ${argc_name:-world}!"
}

# @cmd Example command
# Additional documentation about the command goes here.
# @arg    filename=foo.txt    Positional argument
# @flag   -f --flag           Optional flag
# @option -p --port=80 <PORT> Named argument with default value
example() {
	echo "Filename: ${argc_filename:?}"
	if [[ "${argc_flag+1}" ]]; then
		echo "Flag: passed"
	else
		echo "Flag: not passed"
	fi
	echo "Named argument: ${argc_port:?}"
}

# @cmd Command with complex arguments
# Example: argc args-info --required req --multiple 1 2 3 -- foo bar baz
#
# If the metavar is FILE/DIR/PATH, it will complete files/directories/both in
# the shell completions. To generate completions:
#
#   argc --argc-completions fish mycmd1 mycmd2 | source
# @arg       source* <PATH>  Filename argument
# @arg       dest! <DIR>     Directory argument
# @option    --required!     Must be provided
# @option    --multiple*     Zero or more (alternatively use +)
# @option    --choice[=a|b]  Choice with default value
# @alias args-info
complex-args() {
	# Show all received arguments.
	(set -o posix; set | grep ^argc)
	# Syntax for properly quoting the variable number of arguments:
	echo source: ${argc_source+"${argc_source[@]}"}
}

# @cmd Pass arguments to another command
# @arg       args~  Arguments
pass-args() {
	echo "With no default argument:"
	wrapped-command ${argc_args+"${argc_args[@]}"}

	echo "With a single default argument:"
	wrapped-command "${argc_args[@]:-one default argument}"

	echo "With multiple default arguments:"
	default=(default arguments)
	wrapped-command "${argc_args[@]:-${default[@]}}"
}

wrapped-command() {
	echo "Received $# arguments"
	index=1
	for arg in "$@"; do
		echo "Arg #$index = $arg"
		(( index+=1 ))
	done
	echo
}

if ! command -v argc >/dev/null; then
	echo "This command requires argc. Install from https://github.com/sigoden/argc" >&2
	exit 100
fi
eval "$(argc --argc-eval "$0" "$@")"
