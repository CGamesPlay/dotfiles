#!/bin/bash
# Set up this repository to use jj
set -e
. "$(dirname "$0")/helpers"

if [[ ! -d .jj ]]; then
	jj git init
	jj bookmark track master --remote=origin
	jj config set --repo git.sign-on-push true
	jj config set --repo signing.behavior drop
	jj config set --repo signing.backend ssh
	jj config set --repo signing.backends.ssh.allowed-signers $PWD/share/authorized_signers
fi
