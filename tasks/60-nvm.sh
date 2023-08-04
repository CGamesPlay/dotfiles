#!/bin/sh
# Install nvm
# https://github.com/nvm-sh/nvm

REPO_URL="https://github.com/nvm-sh/nvm.git"
NVM_VERSION=v0.39.3
if cd ~/.config/nvm 2>/dev/null; then
  git fetch origin
  git reset --hard $NVM_VERSION
else
  mkdir -p ~/.config
  git -c advice.detachedHead=false clone -b $NVM_VERSION "$REPO_URL" ~/.config/nvm
fi
