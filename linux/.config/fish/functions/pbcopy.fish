# I have muscle memory for using these commands from macos, and the linux
# replacements are long commands anyways.
function pbcopy --description "Save input to the system clipboard"
  if set -q TMUX
    tmux loadb -
  else if set -q DISPLAY
    xclip -selection clipboard
  else
    @iterm copy
  end
end
