# Defined in /var/folders/2r/0y4kz7r53y1bflwy7l87z4n40000gn/T//fish.abmflU/iterm_badge.fish @ line 2
function iterm_badge
  printf "\033]1337;SetBadgeFormat=%s\a" (echo $argv | base64)
end
