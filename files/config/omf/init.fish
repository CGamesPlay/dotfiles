set -Ux EDITOR vim
set -Ux LESS "-RS"

source $OMF_CONFIG/iterm2_shell_integration.fish

# Disable the default right prompt
function fish_right_prompt; end

# Load hterminal shell integration
if [ ! -z $HTERMINAL_ROOT ]
  source $HTERMINAL_ROOT/share/shell/fish/init.fish
end
