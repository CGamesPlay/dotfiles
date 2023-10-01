function ls
  if command -qs eza
    eza -b $argv
  else
    command ls -G --color=auto $argv
  end
end
