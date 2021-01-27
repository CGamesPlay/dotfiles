function ls
  if command -qs exa
    exa -b $argv
  else
    ls -G $argv
  end
end
