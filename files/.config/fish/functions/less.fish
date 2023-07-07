function less
  if command -qs bat
    bat $argv
  else
    command less $argv
  end
end
