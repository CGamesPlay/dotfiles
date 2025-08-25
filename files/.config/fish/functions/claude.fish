# This is necessary because claude keeps overwriting my shadowed binary.
function claude --wraps "claude"
	command $DFM_DIR/files/.local/bin/claude $argv
end
