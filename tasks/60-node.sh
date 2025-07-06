#!/bin/bash
# Set up an LTS node for use with Copilot
set -ueo pipefail

export PATH="$PATH:$HOME/.local/bin"

if [ -d /usr/local/share/nvm ]; then
	export NVM_DIR=/usr/local/share/nvm
else
	export NVM_DIR=~/.local/share/nvm
	@get nvm
fi

set +u
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
if ! nvm use --silent --lts; then
	nvm install --lts
fi
