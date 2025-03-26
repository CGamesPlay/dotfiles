#!/bin/sh
# Set MacOS defaults that I like.

set -e

if [ "$(uname -s)" != "Darwin" ]; then
    exit
fi

# Save screenshots to Downloads folder
defaults write com.apple.screencapture location ~/Downloads/
