#!/bin/bash
set -e
. "$(dirname "$0")/helpers"

# 2026-05-29. Move pi sessions logs into a location that survives devcontainer
# rebuilds.
if [[ ! -d ~/.local/share/pi/sessions ]] && [[ -d ~/.pi/agent/sessions ]]; then
	mkdir -p ~/.local/share/pi
	mv ~/.pi/agent/sessions ~/.local/share/pi
fi
