if command -q ip
  function ip
    command ip --color=auto $argv
  end
end
