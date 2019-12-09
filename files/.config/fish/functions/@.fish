function @ -d 'Run a pet search for a #common snippet, and place it into the command line'
  pet search --query "\#common\ " $argv | read cmd
  commandline $cmd
end
