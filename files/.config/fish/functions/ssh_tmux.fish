function ssh_tmux --description "ssh with tmux iTerm2 tmux integration" -w ssh
  ssh -t $argv -- tmux -CC new -As0
end
