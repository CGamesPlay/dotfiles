function iterm_ss
	ssh $argv -o ControlMaster=auto -t tmux -CC attach
end
