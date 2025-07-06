bind \cu __llm_cmdcomp

function __llm_cmdcomp -d "Fill in the command using an LLM"
  echo # Start the program on a blank line
  if ! command -q llm
    echo "llm is not installed"
    echo
    commandline -f repaint
    return
  end
  set __llm_oldcmd (commandline -b)
  set __llm_cursor_pos (commandline -C)
  set result (llm cmdcomp $__llm_oldcmd)
  commandline -f repaint
  if test $status -eq 0
    commandline -r $result
    echo # Move down a line to prevent fish from overwriting the program output
  end
end
