#!/bin/sh
# Set MacOS defaults that I like.

set -e

if [ "$(uname -s)" != "Darwin" ]; then
    exit
fi

# Prevent MacVim from updating the system-wide search with whatever code
# snippet I last searched for.
defaults write org.vim.MacVim MMShareFindPboard NO

# Save screenshots to Downloads folder
defaults write com.apple.screencapture location ~/Downloads/
