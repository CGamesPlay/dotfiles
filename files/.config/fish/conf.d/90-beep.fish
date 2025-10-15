# Set up some hooks to beep when a typed command fails.

set -g __beep_status_generation $status_generation

function beep_postexec --on-event fish_postexec
  set -l last_status $status

  if test $__beep_status_generation != $status_generation; and not test -z $beep_command; and not test $last_status = 0
    eval $beep_command
  end
  set -g __beep_status_generation $status_generation
end
