if command -qs bat
  function less --wraps="bat"
    bat $argv
  end
else
  function less --wraps="less"
    command less $argv
  end
end
