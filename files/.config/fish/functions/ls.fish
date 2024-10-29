if command -qs eza
  function ls --wraps "eza"
    eza -b $argv
  end
else
  function ls --wraps "ls"
    command ls -G --color=auto $argv
  end
end
