if command -qs bat
  function less --wraps="bat"
    # When stdin is a terminal, use bat, otherwise, use less directly
    if test -t 0
      bat --paging=always --style=plain $argv
    else
      command less $argv
    end
  end
else
  function less --wraps="less"
    command less $argv
  end
end
