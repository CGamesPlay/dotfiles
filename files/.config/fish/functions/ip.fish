if command -qs ip
  function ip
    command ip --color=auto $argv
  end
end
