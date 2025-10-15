if not command -q fzf
  return
end

function __fzf_history_widget -d "Show command history"
  set -lx FZF_DEFAULT_OPTS "--height 40% $FZF_DEFAULT_OPTS --tiebreak=index --bind=ctrl-r:toggle-sort,ctrl-z:ignore +m"

  set -l result (history -z | fzf --read0 --print0 -q (commandline))
  test -n "$result"; and commandline -r $result
  commandline -f repaint
end

bind \cr __fzf_history_widget
