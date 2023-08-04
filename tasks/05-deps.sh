#!/bin/bash
# Set up system dependencies all in a single place.
set -e
. "$(dirname "$0")/helpers"

if is_installed apt 2>/dev/null; then
    sudo apt-get update
    sudo apt-get install -y curl tar git vim tmux fish
else
    echo "Don't know how to install on this platform" >&2
    exit 1
fi
