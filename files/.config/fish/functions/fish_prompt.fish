function fish_prompt --description 'Write out the prompt'
  set -l last_pipestatus $pipestatus
  set -lx __fish_last_status $status # Export for __fish_print_pipestatus.

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

  set -l delim '$'
  set -l cwd_color $fish_color_cwd
  if test $USER = root
    set delim '#'
    set cwd_color $fish_color_cwd_root
  end

  if not set -q __fish_prompt_cwd
    set -g __fish_prompt_cwd (set_color -o green)
  end

  if not set -q __fish_prompt_user
    set -g __fish_prompt_user (set_color green)
  end
  if not set -q __fish_prompt_host
    set -g __fish_prompt_host (set_color blue)
  end

  # Write pipestatus
  set -l statusb_color (set_color --bold $fish_color_status)
  set -l prompt_status (__fish_print_pipestatus "Command failed: [" "]" "|" "$statusb_color" "$statusb_color" $last_pipestatus)

  echo
  set -q __fish_prompt_status_generation; or set -g __fish_prompt_status_generation $status_generation
  if not test $__fish_prompt_status_generation = $status_generation; and not test -z $prompt_status
    echo $prompt_status
  end
  set __fish_prompt_status_generation $status_generation
  echo -s (set_color $fish_color_user) (date "+%Y-%m-%d %H:%M")'  ' (prompt_login)' ' (set_color $cwd_color) (prompt_pwd -D 2) (set_color $fish_color_cwd) (fish_vcs_prompt)
  echo -n -s (set_color $cwd_color) $delim (set_color normal) ' '
end
