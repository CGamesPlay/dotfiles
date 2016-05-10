set -x EDITOR vim
set -x LESS "-RS"

source iterm2_shell_integration.fish

# Load hterminal shell integration
if [ ! -z $HTERMINAL_ROOT ]
  source $HTERMINAL_ROOT/share/shell/fish/init.fish
end
