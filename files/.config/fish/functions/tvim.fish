function tvim --description 'Start vim in tmux window 1' -w vim
  # The -- is necessary because tmux treats the single-word command as a shell
  # script, so it would actually execute `fish -c vim` if no args were passed.
  tmux new-window -c (pwd) -bt 1 vim -- $argv
end
