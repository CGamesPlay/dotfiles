# I have muscle memory for using these commands from macos, and the linux
# replacements are long commands anyways.
function pbpaste --description "Output contents of the system clipboard"
  if set -q TMUX
    tmux saveb -
  else if set -q DISPLAY
    xclip -selection clipboard -o
  else
    @iterm paste
  end
end
