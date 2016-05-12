set -x EDITOR vim
set -x LESS "-RS"

source ~/.config/fish/iterm2_shell_integration.fish

# Load hterminal shell integration
if [ ! -z $HTERMINAL_ROOT ]
  source $HTERMINAL_ROOT/share/shell/fish/config.fish
end
