function setbg
  set -l profile
  switch $argv[1]
    case dark
      set profile Dark
    case light
      set profile Light
    case '*'
      echo "Either light or dark" >&2
      return 1
  end
  echo -e "\e]50;SetProfile=Default - $profile\a"
end
