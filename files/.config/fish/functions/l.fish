function l
  if command -qs exa
    exa $argv
  else
    ls $argv
  end
end
