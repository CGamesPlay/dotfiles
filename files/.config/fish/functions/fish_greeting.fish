function fish_greeting
  set phase (fish_moon)
  if test phase = full
    echo
    echo "  🌕  You are lucky! Full moon tonight."
    echo
  else if test phase = new
    echo
    echo "  🌑  Be careful! New moon tonight."
    echo
  else if test (date "+%a %d") = "Fri 13"
    echo
    echo "  🧿  Watch out! Bad things can happen on Friday the 13th."
    echo
  end
end

