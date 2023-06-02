# Defined in /var/folders/2r/0y4kz7r53y1bflwy7l87z4n40000gn/T//fish.EjGOwt/zz.fish @ line 2
function zz --description 'Jump to a directory with fasd'
  fasd -Rdl | \
    FZF_DEFAULT_OPTS="$FZF_DEFAULT_OPTS --height 40% --reverse" \
    fzf --query=$argv --tiebreak=index --select-1 | \
    read -l ret
  test -z "$ret"; and return
  cd "$ret" && pwd
end
