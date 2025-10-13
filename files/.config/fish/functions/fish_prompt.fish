function fish_prompt --description 'Write out the prompt'
  set -f last_pipestatus $pipestatus
  set -fx __fish_last_status $status # Export for __fish_print_pipestatus.

  # Define a function to print a blank line before the prompt. This is done as a
  # separate function so that the Iterm2 shell integration marker gets printed
  # AFTER the blank line.
  if not functions -q __fish_blank_before_prompt
    function __fish_blank_before_prompt --on-event fish_prompt
      echo
    end
  end

  # If an @env name is given, print that as the hostname
  set -f color_host $fish_color_host
  if ! test -z $ATENV_NAME; and set -q fish_color_host_remote
    set -f host $ATENV_NAME
    set color_host $fish_color_host_remote
  else
    set -f host (prompt_hostname)
  end

  if test $USER = root
    set -f login_str (set_color $fish_color_user)"$USER"(set_color normal)"@"(set_color $color_host)$host(set_color normal)
    set -f delim '#'
    set -f cwd_color $fish_color_cwd_root
  else
    set -f login_str (set_color $color_host)$host(set_color normal)
    set -f delim '$'
    set -f cwd_color $fish_color_cwd
  end

  # Write pipestatus
  set -f statusb_color (set_color $fish_color_status)
  set -f prompt_status (__fish_print_pipestatus "Command failed: [" "]" "|" "$statusb_color" "$statusb_color" $last_pipestatus)

  set -q __fish_prompt_status_generation; or set -g __fish_prompt_status_generation $status_generation
  if not test $__fish_prompt_status_generation = $status_generation; and not test -z $prompt_status
    echo $prompt_status
  end
  set __fish_prompt_status_generation $status_generation

  echo -s \
    (set_color $fish_color_date) (date "+%Y-%m-%d %H:%M") (set_color normal) \
    (set_color $fish_color_user) '  ' $login_str '  ' \
    (set_color $cwd_color) (prompt_pwd -D 2) ' ' (fish_vcs_prompt)
  echo -n -s (set_color $cwd_color) $delim (set_color normal) ' '
end
