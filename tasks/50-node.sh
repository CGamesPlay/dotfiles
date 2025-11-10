#!/bin/bash
# Set up an LTS node for use with Copilot
set -ueo pipefail

export PATH="$PATH:$HOME/.local/bin"

if [ -d /usr/local/share/nvm ]; then
	export NVM_DIR=/usr/local/share/nvm
else
	export NVM_DIR=~/.local/share/nvm
	if ! [ -d "$NVM_DIR" ]; then
		git clone https://github.com/nvm-sh/nvm.git "$NVM_DIR"
		cd "$NVM_DIR"
		git checkout "$(git describe --abbrev=0 --tags --match "v[0-9]*" "$(git rev-list --tags --max-count=1)")"
	fi
fi

set +u
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
if ! nvm use --silent --lts; then
	nvm install --lts
fi
