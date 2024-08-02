function vim
  if test "$EDITOR" != "vim"
    echo "$EDITOR is nvim. Waiting 5 seconds." >&2
    sleep 5
  end
  command vim $argv
end
