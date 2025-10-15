if command -q bat
  function cat --wraps="bat"
    bat -pp $argv
  end
else
  function cat --wraps="cat"
    command cat $argv
  end
end
