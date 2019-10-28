# Welcome to my zshrc!

# oh-my-zsh {{{

# vim: foldmethod=marker

# Path to your oh-my-zsh configuration.
ZSH=$HOME/.oh-my-zsh

# I find the auto update to be very interrupting
DISABLE_AUTO_UPDATE="true"

# Uncomment following line if you want red dots to be displayed while waiting
# for completion
COMPLETION_WAITING_DOTS="true"

source $ZSH/oh-my-zsh.sh

# }}}

# Basic settings {{{

export PAGER="less -r"
export LANG="en_US.UTF-8"
export PATH=/Users/rpatterson/bin:$PATH

export LESS="-FRSX"
export EDITOR="vim"
export CLICOLOR=1

export HISTSIZE=100000
export SAVEHIST=100000

# I hate shared history, it turns out
setopt nosharehistory noincappendhistory
setopt nohistignorespace

# This is to make ^W work correctly
unset WORDCHARS

# }}}

# Custom functions {{{

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

function ss() {
  echo ssh "$@" -o ControlMaster=auto -t tmux attach
  ssh "$@" -o ControlMaster=auto -t tmux attach
}

# }}}

# Prompt {{{

PROMPT='
%{$fg_bold[green]%}%n@%m %{$fg_bold[red]%}%D{%x %I:%M %p} %{$fg_bold[blue]%}${PWD/#$HOME/~}$(git_prompt_info)
$ %{$reset_color%}'

ZSH_THEME_GIT_PROMPT_PREFIX=" %{$fg_bold[magenta]%}branch "
ZSH_THEME_GIT_PROMPT_SUFFIX="%{$fg_bold[blue]%}"
ZSH_THEME_GIT_PROMPT_DIRTY="*"
ZSH_THEME_GIT_PROMPT_CLEAN=""

# }}}

# Completion {{{

zmodload zsh/complist
autoload -U compinit && compinit
zstyle ':completion:::::' completer _complete _approximate
zstyle -e ':completion:*:approximate:*' max-errors 'reply=( $(( ($#PREFIX + $#SUFFIX) / 3 )) )'
zstyle ':completion:*:descriptions' format "- %d -"
zstyle ':completion:*:corrections' format "- %d - (errors %e})"
zstyle ':completion:*:default' list-prompt '%S%M matches%s'
zstyle ':completion:*' group-name ''
zstyle ':completion:*:manuals' separate-sections true
zstyle ':completion:*' menu select
zstyle ':completion:*' verbose yes
## case-insensitive (uppercase from lowercase) completion
zstyle ':completion:*' matcher-list 'm:{a-z}={A-Z}'
#zstyle ':completion:*' special-dirs ..

# }}}

export PATH="$PATH:$HOME/.rvm/bin" # Add RVM to PATH for scripting
