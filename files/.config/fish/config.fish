set -x EDITOR vim
set -x LESS "-RSF"
set -x PATH ./node_modules/.bin $PATH

if [ ! -z "$GOPATH" ]
  set -x PATH $GOPATH/bin $PATH
  set -x VIRTUALGO_DISABLE_PROMPT 1
  $GOPATH/bin/vg eval --shell fish | source
end

eval (python -m virtualfish)

source ~/.config/fish/iterm2_shell_integration.fish

# Load hterminal shell integration
if [ ! -z "$HTERMINAL_ROOT" ]
  source $HTERMINAL_ROOT/share/shell/fish/config.fish
end
