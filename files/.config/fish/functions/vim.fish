function vim
  if test "$EDITOR" = "nvim"
    echo "\$EDITOR is nvim." >&2
    echo "" >&2
    echo "- Use `nvim` instead" >&2
    echo "- Use `command vim` to run vim once" >&2
    echo "- Use `set EDITOR vim` to disable this check" >&2
    return 1
  end
  command vim $argv
end
