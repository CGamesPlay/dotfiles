#!/usr/bin/env bash
set -eu

if [[ "$(id -un)" != "$_REMOTE_USER" ]]; then
	exec sudo --preserve-env=_REMOTE_USER,_REMOTE_USER_HOME,GITHUBTOKEN -u "$_REMOTE_USER" "$0" "$@"
fi

DOTFILES_REPOSITORY=https://gitlab.com/CGamesPlay/dotfiles.git

export EGET_GITHUB_TOKEN=$GITHUBTOKEN

git clone "$DOTFILES_REPOSITORY" "$_REMOTE_USER_HOME/dotfiles"
cd "$_REMOTE_USER_HOME/dotfiles"
./bootstrap.sh
