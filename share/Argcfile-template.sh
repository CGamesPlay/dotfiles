#!/usr/bin/env bash
# @describe Example Argcfile

# Argc docs: https://github.com/sigoden/argc

set -eu

# @cmd Example command
# Additional documentation about the command goes here.
# @arg      filename=foo.txt    Positional argument
# @flag     -v --verbose        Boolean argument
# @option   -p --port=80 <PORT> Named argument
example() {
    echo "Example command: $argc_filename"
    echo "Boolean flag: ${argc_verbose:-0}"
    echo "Named argument: $argc_port"
}

# @cmd Command with complex arguments
# Example: argc args-info --required req --multiple 1 2 3 -- foo bar baz
#
# If the metavar is FILE/DIR/PATH, it will complete files/directories/both in
# the shell completions. To generate completions:
#
#   argc --argc-completions fish mycmd1 mycmd2 | source
# @arg      source* <PATH>  Filename argument
# @arg      dest! <DIR>     Directory argument
# @option   --required!     Must be provided
# @option   --multiple*     Zero or more (alternatively use +)
# @option   --choice[=a|b]  Choice with default value
# @alias    args-info
args() {
    (set -o posix; set | grep argc)
}

eval "$(argc --argc-eval "$0" "$@")"
