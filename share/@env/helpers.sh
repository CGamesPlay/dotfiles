# shellcheck shell=bash

# Quote each argument and join with spaces.
#
# This function is essential to use when passing commands over SSH, since SSH
# does not escape its arguments on its own. For example, instead of
# `ssh host "$cmd"`, use `ssh host "exec sh -c $(shelljoin "$cmd")"`.
shelljoin() {
	local xtrace
	[[ $- == *x* ]] && xtrace=1 || xtrace=0
	set +x
	payload=""
	for arg in "$@"; do
		if [[ $arg =~ [^-a-zA-Z0-9_] ]]; then
			# Can't use printf %q because it produces strings that are not
			# interpretable by dash. We can't use the POSIX-compliant way to
			# escape with single quotes either because fish interprets them
			# differently (which breaks double-quoted strings). So, we replace
			# quotes with '\'' as normal but additionally replace backslash
			# with '\\'.
			# We will use `a` as a temporary escape character. `aa` will
			# produce `a`, `a'` will produce `'\''` and `a\` will produce
			# `'\\'`.
			# 1. Quote special characters.
			arg=${arg//a/aa}
			arg=${arg//\'/a\'}
			arg=${arg//\\/a\\}
			# 2. Unquote.
			arg=${arg//a\\/\'\\\\\'}
			arg=${arg//a\'/\'\\\'\'}
			arg=${arg//aa/a}
			arg=\'$arg\'
		fi
		payload+="$arg "
	done
	[[ $xtrace -eq 1 ]] && set -x
	echo "${payload% }"
}

# Wraps the standard SSH to provide a TTY when possible.
#
# To bypass this behavior, use `command ssh` instead.
ssh() {
	local cmd=(ssh)
	if [ -t 1 ]; then cmd+=(-t); fi
	cmd+=("$@")
	command "${cmd[@]}"
}
