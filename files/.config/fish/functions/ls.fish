function ls
  if command -qs exa
    exa -b $argv
  else
    command ls -G --color=auto $argv
  end
end
