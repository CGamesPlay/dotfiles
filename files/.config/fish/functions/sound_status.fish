# Defined in /var/folders/2r/0y4kz7r53y1bflwy7l87z4n40000gn/T//fish.NcH1WN/sound_status.fish @ line 2
function sound_status
  set -l last_status $status
  test $last_status -eq 0 && ding || bonk
  return $last_status
end
