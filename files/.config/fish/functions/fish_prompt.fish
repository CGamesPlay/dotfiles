function fish_prompt --description 'Write out the prompt'

  set -l last_status $status

  if set -q HTERMINAL_ROOT
    echo -n \$" "
    return
  end

  # Just calculate these once, to save a few cycles when displaying the prompt
  if not set -q __fish_prompt_hostname
    set -g __fish_prompt_hostname (hostname|cut -d . -f 1)
  end

  if not set -q __fish_prompt_normal
    set -g __fish_prompt_normal (set_color normal)
  end

  if not set -q __fish_prompt_date
    set -g __fish_prompt_date (set_color -o red)
  end

  set -l delim '$'

  if test $USER = root
    set -l delim '#'
  end

  if not set -q __fish_prompt_cwd
    set -g __fish_prompt_cwd (set_color -o green)
  end

  set -l prompt_status
  if test $last_status -ne 0
    if not set -q __fish_prompt_status
      set -g __fish_prompt_status (set_color -o red)
    end
    set prompt_status "$__fish_prompt_status""[$last_status] "
  end

  if not set -q __fish_prompt_user
    set -g __fish_prompt_user (set_color green)
  end
  if not set -q __fish_prompt_host
    set -g __fish_prompt_host (set_color blue)
  end

  printf '\f\r%s%s%s@%s%s %s%s %s%s%s\f\r%s%s%s%s ' \
    $__fish_prompt_user $USER $__fish_prompt_normal \
    $__fish_prompt_host $__fish_prompt_hostname \
    $__fish_prompt_date (date "+%x %I:%M %p") \
    $__fish_prompt_cwd (prompt_pwd) (__fish_git_prompt; or echo) \
    $prompt_status $__fish_prompt_cwd $delim $__fish_prompt_normal
end
