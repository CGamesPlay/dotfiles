# Defined in /var/folders/2r/0y4kz7r53y1bflwy7l87z4n40000gn/T//fish.Dg0kaj/iterm_sound.fish @ line 2
function iterm_sound
  printf "\033]1337;Custom=id=%s:%s\a" "play-sound" $argv
end
