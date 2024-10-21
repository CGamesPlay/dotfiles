#!/bin/bash
# Install binaries using eget.
set -euo pipefail

export EGET_BIN=~/.local/bin/

eget() {
	if [ -x "$EGET_BIN/$1" ]; then
		return
	fi
	shift
	command eget "$@"
}

eget ecslog trentm/go-ecslog -f ecslog
eget hivemind DarthSim/hivemind
