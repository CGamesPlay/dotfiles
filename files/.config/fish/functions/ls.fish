function ls
  if command -qs exa
    exa $argv
  else
    ls -G $argv
  end
end
