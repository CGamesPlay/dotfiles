function sound_status
  set -l last_status $status
  set -g beep_primed ""
  if test $last_status -eq 0
    ding
  else
    bonk
  end
  @iterm bounce --forever
  if test -z $argv
    @iterm notify "Command finished with status $last_status"
  else
    @iterm notify "$argv finished with status $last_status"
  end
  return $last_status
end
