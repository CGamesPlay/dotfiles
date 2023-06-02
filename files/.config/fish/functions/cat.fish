function cat
  if command -qs bat
    bat $argv
  else
    command cat $argv
  end
end
