#!/usr/bin/env bash
# @describe Devcontainer workspace
# For more information about argc, see https://github.com/sigoden/argc

set -eu

# @cmd Run devcontainer for the workspace
# @arg command* Arguments to devcontainer
devcontainer() { :; }

devcontainer::main() {
	if [[ ${argc_command:+1} ]]; then
		_devcontainer "${argc_command[@]}"
	else
		_devcontainer --help
        exit 1
	fi
}

# @cmd Shell in the devcontainer
# @arg command* Arguments passed to the shell
devcontainer::shell() {
    if [[ ${argc_command:+1} ]]; then
        _devcontainer exec sh -c "${argc_command+"${argc_command[@]}"}"
    else
        _devcontainer exec fish
    fi
}

# @cmd Start the devcontainer
# @flag   --restart   Restart the container if already running
# @flag   --rebuild   Rebuild the existing container if it exists
devcontainer::up() {
	if [[ ${argc_restart+1} ]]; then
		id=$(find_devcontainer)
		if [[ "$id" ]]; then docker stop "$id"; fi
	fi
    args=(--dotfiles-repository=https://gitlab.com/CGamesPlay/dotfiles.git)
    if [[ ${argc_rebuild+1} ]]; then
        args=("${args[@]}" --remove-existing-container)
    fi
    if docker version | grep 'Docker Desktop' >/dev/null; then
        args=("${args[@]}"
            --mount=type=bind,source=/run/host-services/ssh-auth.sock,target=/run/ssh-agent.sock
            --remote-env=SSH_AUTH_SOCK=/run/ssh-agent.sock
        )
    elif [[ "${SSH_AUTH_SOCK:-}" ]]; then
        args=("${args[@]}"
            --mount=type=bind,source=$SSH_AUTH_SOCK,target=/run/ssh-agent/ssh-auth.sock
            --remote-env=SSH_AUTH_SOCK=/run/ssh-agent/ssh-auth.sock
        )
    fi
    _devcontainer up "${args[@]}"
}

find_devcontainer() {
	docker ps -f label=devcontainer.local_folder="$(pwd)" --format '{{.ID}}'
}

_devcontainer() {
    if [[ "${DEVCONTAINER_ID+1}" ]]; then
        echo "Refusing to nest devcontainers." >&2
        return 1
    fi
    subcommand="$1"
    shift
    exec devcontainer "$subcommand" --workspace-folder=. "$@"
}

if ! command -v argc >/dev/null; then
	echo "This command requires argc. Install from https://github.com/sigoden/argc" >&2
	exit 100
fi
eval "$(argc --argc-eval "$0" "$@")"