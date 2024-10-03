#!/usr/bin/env bash
# @describe Integration between hetzner-bootable-volume and dotfiles

set -eu

# @cmd Create a bootable volume with dotfiles and RAID1
# @arg    volume!                   Name or ID of bootable volume
# @option    --size!                <GB> Size of volume in GiB
# @option    --location=nbg1        <LOCATION> Where to create volume
# @option    --image=ubuntu-22.04   <ID> Image to use for volume
# @option -t --server-type          <TYPE> Type of machine to use for preparation
# @option -k --ssh-key              <ID> SSH key to use for preparation
create-hbv() {
	user_data=$(mktemp)
	trap 'rm "$user_data"' EXIT
	./initial-boot-user-data.py > "$user_data"

	hcloud volume create --size="${argc_size:?}" --location="${argc_location:?}" --name="${argc_volume:?}"

	prepare_args=(
		--image="${argc_image:?}"
		--user-data-from-file="$user_data"
		--login-user=ubuntu
		"$argc_volume"
	)
	if [[ ${argc_server_type+1} ]]; then
		prepare_args+=(--server-type="$argc_server_type")
	fi
	if [[ ${argc_ssh_key+1} ]]; then
		prepare_args+=(--ssh-key="$argc_ssh_key")
	fi
	./hetzner-bootable-volume prepare-volume "${prepare_args[@]}"
}

# @cmd Install hetzner-bootable-volume
install() {
	ln -sf "$(pwd)/hetzner-bootable-volume" ~/.local/bin/
}

if ! command -v argc >/dev/null; then
	echo "This command requires argc. Install from https://github.com/sigoden/argc" >&2
	exit 100
fi
eval "$(argc --argc-eval "$0" "$@")"
