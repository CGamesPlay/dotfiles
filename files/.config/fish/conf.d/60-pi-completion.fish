bind alt-p __pi_completion

if ! set -q pi_completion_options
  set -U pi_completion_options --preset small
end

function __pi_completion -d "Fill in the command using an LLM"
  echo # Start the program on a blank line

  set -l original (commandline -b)

  set -l result (@pi completion $original $pi_completion_options 100>&1 >/dev/tty)

  if test -n "$result"
    commandline -r $result
  end

  echo
  commandline -f repaint
end
