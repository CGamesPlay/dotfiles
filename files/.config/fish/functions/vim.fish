function vim
  if test "$EDITOR" == "nvim"
    echo "$EDITOR is nvim. Launching that instead in 5 seconds." >&2
    echo "Use `command vim` to bypass." >&2
    sleep 5
    command nvim $argv
    return
  end
  command vim $argv
end
