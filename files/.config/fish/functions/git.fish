function git
  # If this repository is a jj repository, ban direct use of git. This is to
  # help me overcome muscle memory issues while switching to jj. There are a
  # few escape hatches provided. The check for config / help is necessary
  # because the completions for git call into these subcommands, and we don't
  # want to break those.
  # https://github.com/fish-shell/fish-shell/pull/4118/files
  if command -q jj;
      and jj workspace root >/dev/null 2>&1;
      and ! set -q allow_git_in_jj;
      and ! contains $argv[1] config help log grep remote fetch push pull
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
