#!/bin/sh
# I don't use the neovim-ppa/stable registry, because it hasn't been updated
# since 2022. I don't use the neovim-ppa/unstable registry, because (it was
# broken and) it isn't supported by the Neovim team:
# https://github.com/neovim/neovim/issues/26746#issuecomment-1869683247
set -e

curl -LO https://github.com/neovim/neovim/releases/latest/download/nvim-linux64.tar.gz
sudo rm -rf /opt/nvim-linux64
sudo tar -C /opt -xzf nvim-linux64.tar.gz
rm nvim-linux64.tar.gz
