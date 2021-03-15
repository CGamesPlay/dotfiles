function zz -d "Jump to a directory with fasd"
  fasd -Rdl | \
    FZF_DEFAULT_OPTS="$FZF_DEFAULT_OPTS --height 40% --reverse" \
    fzf --query=$argv | \
    read -l ret
  test -z "$ret"; and return
  cd "$ret"
end
