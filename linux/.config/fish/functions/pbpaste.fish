# I have muscle memory for using these commands from macos, and the linux
# replacements are long commands anyways.
function pbpaste --description "Output contents of the system clipboard"
  if set -q TMUX
    tmux saveb -
  else
    xclip -selection clipboard -o
  end
end
