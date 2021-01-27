# Defined in /var/folders/2r/0y4kz7r53y1bflwy7l87z4n40000gn/T//fish.gnoP6y/npm.fish @ line 2
function npm
  if ! test -e package-lock.json && test -e yarn.lock
    echo "npm: package-lock.json missing and yarn.lock present, aborting" >&2
    echo "npm: use `command npm` to bypass." >&2
    return 1
  else
    command npm $argv
  end
end
