if command -q eza
  function ls --wraps "eza"
    eza --binary --group-directories-first --across $argv
  end
else
  function ls --wraps "ls"
    command ls -G --color=auto $argv
  end
end
