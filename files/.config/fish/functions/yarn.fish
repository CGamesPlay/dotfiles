# Defined in /var/folders/2r/0y4kz7r53y1bflwy7l87z4n40000gn/T//fish.k0fYdc/yarn.fish @ line 2
function yarn
  if test -e package-lock.json && ! test -e yarn.lock
    echo "yarn: yarn.lock missing and package-lock.json present, aborting" >&2
    echo "yarn: use `command yarn` to bypass." >&2
    return 1
  else
    command yarn $argv
  end
end
