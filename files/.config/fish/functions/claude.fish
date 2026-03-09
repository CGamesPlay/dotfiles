# This is necessary because claude insists that it owns ~/.local/bin/claude. 
function claude --wraps $DFM_DIR/share/claude
	command $DFM_DIR/share/claude $argv
end
