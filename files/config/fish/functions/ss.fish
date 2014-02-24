function ss
	echo ssh $argv -o ControlMaster=auto -t tmux attach
    ssh $argv -o ControlMaster=auto -t tmux attach
end
