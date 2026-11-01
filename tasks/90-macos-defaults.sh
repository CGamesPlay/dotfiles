#!/bin/sh
# Set MacOS defaults that I like.

set -e

if [ "$(uname -s)" != "Darwin" ]; then
    exit
fi

# Save screenshots to Downloads folder
defaults write com.apple.screencapture location ~/Downloads/

# Disable "write with Siri"
sudo defaults write /Library/Preferences/FeatureFlags/Domain/WritingTools LightweightUI_macOS -dict Enabled -bool false
