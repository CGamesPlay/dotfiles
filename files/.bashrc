# .bashrc

# Test for an interactive shell.  There is no need to set anything
# past this point for scp and rcp, and it's important to refrain from
# outputting anything in those cases.
if [[ $- != *i* ]] ; then
  # Shell is non-interactive.  Be done now!
  return
fi

# Source global definitions
if [ -f /etc/bashrc ]; then
  . /etc/bashrc
fi

# Put your fun stuff here.
export BASE_DIR="$HOME"
export PATH="$BASE_DIR/bin:$PATH"
export PAGER="less -r"
export LANG="en_US.UTF-8"
# append to the history file, don't overwrite it
shopt -s histappend
# check the window size after each command and, if necessary,
# update the values of LINES and COLUMNS.
shopt -s checkwinsize

unset PROMPT_COMMAND
export PS1="\n\[\033[1;32m\]\u@\h \[\033[1;31m\]\d \@\[\033[1;34m\] \w \n\[\033[1;34m\]\$\[\033[0m\] "
export HISTCONTROL=erasedups
export LESS="-FRSX"
export EDITOR="vim"
export CLICOLOR=1

. /usr/local/git/contrib/completion/git-completion.bash

function ss() {
  echo ssh "$@" -o ControlMaster=auto -t tmux attach
  ssh "$@" -o ControlMaster=auto -t tmux attach
}

function title() {
  export SCREEN_TITLE=$1
  # Set icon name to string (tab title)
  echo -ne "\033]0;$1\007"
}

function highlight() {
  local args=( "$@" )
  for (( i=0; i<${#args[@]}; i++ )); do
    if [ "${args[$i]:0:1}" != "-" ]; then
      args[$i]="(${args[$i]})|$"
      break
    fi
  done
  grep --color -E "${args[@]}"
}

# enable color support of ls and also add handy aliases
if [ -x /usr/bin/dircolors ]; then
    eval "`dircolors -b`"
    alias ls='ls --color=auto'

    alias grep='grep --color=auto'
    #alias fgrep='fgrep --color=auto'
    #alias egrep='egrep --color=auto'
fi

# enable programmable completion features (you don't need to enable
# this, if it's already enabled in /etc/bash.bashrc and /etc/profile
# sources /etc/bash.bashrc).
#if [ -f /etc/bash_completion ]; then
#    . /etc/bash_completion
#fi
