function git
  if jj workspace root >/dev/null 2>&1; and ! set -q allow_git_in_jj
    echo "This is a `jj` managed repository." >&2
    echo "" >&2
    echo "- Use `jj` instead" >&2
    echo "- Use `command git` to run git once" >&2
    echo "- Use `set allow_git_in_jj true` to disable this check" >&2
    echo "" >&2
    return 1
  end
  command git $argv
end
