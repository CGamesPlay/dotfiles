# Set up some hooks to beep when a typed command fails.

if test -z $beep_command
  set beep_command "printf \a"
end
set beep_primed ""
function beep_preexec --on-event fish_preexec
  set -g beep_primed 1
end
function beep_postexec --on-event fish_postexec
  set -l last_status $status
  if test ! -z $beep_primed -a ! -z $argv[1] -a $last_status -ne 0
    eval $beep_command
  end
  set -g beep_primed ""
end
