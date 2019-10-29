#!/bin/sh
set -e
mkdir -p ~/.vim/bundle ~/.vim/swaps
cd ~/.vim/bundle
[ ! -d Vundle.vim ] && git clone https://github.com/gmarik/Vundle.vim.git
vim -c VundleInstall -c qa
