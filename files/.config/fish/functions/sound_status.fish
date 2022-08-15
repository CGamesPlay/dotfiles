# Defined in /var/folders/2r/0y4kz7r53y1bflwy7l87z4n40000gn/T//fish.YknqL5/sound_status.fish @ line 2
function sound_status
  set -l last_status $status
  set -g beep_primed ""
  if test $last_status -eq 0
    ding
  else
    bonk
  end
  iterm_bounce
  if test -z $argv
    iterm_notify "Command finished with status $last_status"
  else
    iterm_notify "$argv finished with status $last_status"
  end
  return $last_status
end
