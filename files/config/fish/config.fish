# Path to your oh-my-fish.
set fish_path $HOME/.config/oh-my-fish

# Which plugins would you like to load? (plugins can be found in ~/.oh-my-fish/plugins/*)
# Custom plugins may be added to ~/.oh-my-fish/custom/plugins/
# Example format: set fish_plugins autojump bundler
set fish_plugins rvm bundler

# Path to your custom folder (default path is $FISH/custom)
#set fish_custom $HOME/dotfiles/oh-my-fish

# Load oh-my-fish configuration.
. $fish_path/oh-my-fish.fish

set -Ux EDITOR vim
set -U __fish_init_1_22_0 \x1d
set -U __fish_init_1_50_0 \x1d
set -U __prompt_initialized_2 \x1d
set -U fish_color_autosuggestion 555\x1eyellow
set -U fish_color_command 005fd7\x1epurple
set -U fish_color_comment red
set -U fish_color_cwd green
set -U fish_color_cwd_root ff0000
set -U fish_color_error red\x1e\x2d\x2dbold
set -U fish_color_escape cyan
set -U fish_color_history_current cyan
set -U fish_color_host \x2do\x1eblue
set -U fish_color_match cyan
set -U fish_color_normal normal
set -U fish_color_operator cyan
set -U fish_color_param 00afff\x1ecyan
set -U fish_color_quote brown
set -U fish_color_redirection normal
set -U fish_color_search_match \x2d\x2dbackground\x3dpurple
set -U fish_color_status red
set -U fish_color_user \x2do\x1egreen
set -U fish_color_valid_path \x2d\x2dunderline
set -U fish_greeting Welcome\x20to\x20fish\x2c\x20the\x20friendly\x20interactive\x20shell\x0aType\x20\x1b\x5b32mhelp\x1b\x5b30m\x1b\x28B\x1b\x5bm\x20for\x20instructions\x20on\x20how\x20to\x20use\x20fish
set -U fish_key_bindings fish\x5fdefault\x5fkey\x5fbindings
set -U fish_pager_color_completion normal
set -U fish_pager_color_description 555\x1eyellow
set -U fish_pager_color_prefix cyan
set -U fish_pager_color_progress cyan
