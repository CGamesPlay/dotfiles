# Defined in /var/folders/2r/0y4kz7r53y1bflwy7l87z4n40000gn/T//fish.UXq4Qv/fish_greeting.fish @ line 2
function fish_greeting
	set phase (fish_moon)
  if test $phase = full
    echo
    echo "  🌕  You are lucky! Full moon tonight."
  else if test $phase = new
    echo
    echo "  🌑  Be careful! New moon tonight."
  else if test (date "+%a %d") = "Fri 13"
    echo
    echo "  🧿  Watch out! Bad things can happen on Friday the 13th."
  end
end
