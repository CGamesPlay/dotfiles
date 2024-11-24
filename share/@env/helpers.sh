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

# Write a Procfile describing commands to forward ports.
#
# Pass a bash script as a heredoc that makes use of the provided functions. Functions available:
#
# `ssh_agent` will forward the local SSH agent to /tmp/ssh-$UID/wwh-auth.sock
# in the remote environment.
#
# `vscodium_server PORT` will start a vscodium-server and forward the local
# port to that server.
#
# `forward_tcp LOCAL REMOTE` will forward the local TCP port to the remote
# destination (either host:port or just port).
#
# shellcheck disable=SC2317
declare_ports() {
	ssh_agent() {
		local environment_exec listen_script remote_command
		environment_exec="$0 exec ${ATENV_PORT_ENV:?}"
		# The listener script will kill any old listeners on the socket and
		# then run socat in a loop. The loop prevents requests from becoming
		# interleaved (concurrent requests are not possible).
		listen_script="SOCKET_PATH=\"/tmp/ssh-\$(id -u)/ssh-auth.sock\"; if [ -e \$SOCKET_PATH ]; then fuser -k \$SOCKET_PATH >/dev/null 2>&1; fi; mkdir -p \"\$(dirname \"\$SOCKET_PATH\")\" && chmod 700 \"\$(dirname \"\$SOCKET_PATH\")\" && while socat UNIX-LISTEN:\$SOCKET_PATH,unlink-early -; do :; done"
		remote_command="$environment_exec exec sh -c $(shelljoin "$listen_script")"
		echo "# Forward SSH agent"
		# shellcheck disable=SC2001
		printf "ssh-agent: while true; do socat EXEC:%s UNIX-CONNECT:%s; sleep 1; done\n" \
			"$(shelljoin "$(echo "$remote_command" | sed 's/[:,!"'\''\\(\[{]/\\&/g')")" \
			"$SSH_AUTH_SOCK"
	}

	vscodium_server() {
		echo "# Expose vscodium on local port $1"
		local environment_exec start_script connect_script
		environment_exec="$0 exec ${ATENV_PORT_ENV:?}"
		start_script="$environment_exec exec sh -c \"\$(vscodium-server get-start-script -d)\" < /dev/null"
		connect_script="$environment_exec exec sh -c \"\$(vscodium-server get-connect-script --use-existing)\""
		# shellcheck disable=SC2001
		printf "vscodium: %s && lsof -i:'$1' | xargs -r kill && socat TCP-LISTEN:%s,reuseaddr,fork SYSTEM:%s\n" \
			"$start_script" \
			"$1" \
			"$(shelljoin "$(echo "$connect_script" | sed 's/[:,!"'\''\\(\[{]/\\&/g')")"
	}

	forward_tcp() {
		local environment_exec="$0 exec ${ATENV_PORT_ENV:?}"
		local remote_command="$environment_exec exec socat STDIO 'TCP:$2'"
		echo "# Forward local $1 to remote $2"
		# shellcheck disable=SC2001
		printf "port-%s: lsof -i:'$1' -t | xargs -r kill && socat TCP-LISTEN:%s,reuseaddr,fork EXEC:%s\n" \
			"$1" \
			"$1" \
			"$(shelljoin "$(echo "$remote_command" | sed 's/[:,!"'\''\\(\[{]/\\&/g')")"
	}

	# shellcheck disable=SC1091
	. /dev/stdin
}

