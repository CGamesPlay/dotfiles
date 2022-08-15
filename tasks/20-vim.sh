#!/bin/sh
set -e
mkdir -p ~/.config/vim/bundle
cd ~/.config/vim/bundle
[ ! -d Vundle.vim ] && git clone https://github.com/gmarik/Vundle.vim.git
vim -E -s  -c "source ~/.vimrc" +PluginInstall +qall
echo
