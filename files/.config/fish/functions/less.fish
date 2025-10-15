if command -q bat
  function less --wraps="bat"
    # When stdin is a terminal, use bat, otherwise, use less directly
    if status is-interactive
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
