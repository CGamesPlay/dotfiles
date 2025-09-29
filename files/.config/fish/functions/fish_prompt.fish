function fish_prompt --description 'Write out the prompt'
  set -l last_pipestatus $pipestatus
  set -lx __fish_last_status $status # Export for __fish_print_pipestatus.

  # Define a function to print a blank line before the prompt. This is done as a
  # separate function so that the Iterm2 shell integration marker gets printed
  # AFTER the blank line.
  if not functions -q __fish_blank_before_prompt
    function __fish_blank_before_prompt --on-event fish_prompt
      echo
    end
  end

  # Just calculate these once, to save a few cycles when displaying the prompt
  set -l delim '$'
  set -l cwd_color $fish_color_cwd
  if test $USER = root
    set delim '#'
    set cwd_color $fish_color_cwd_root
  end

  # Write pipestatus
  set -l statusb_color (set_color $fish_color_status)
  set -l prompt_status (__fish_print_pipestatus "Command failed: [" "]" "|" "$statusb_color" "$statusb_color" $last_pipestatus)

  set -q __fish_prompt_status_generation; or set -g __fish_prompt_status_generation $status_generation
  if not test $__fish_prompt_status_generation = $status_generation; and not test -z $prompt_status
    echo $prompt_status
  end
  set __fish_prompt_status_generation $status_generation
  echo -s \
    (set_color $fish_color_date) (date "+%Y-%m-%d %H:%M") (set_color normal) \
    (set_color $fish_color_user) '  ' (prompt_login)' ' \
    (set_color $cwd_color) (prompt_pwd -D 2) (fish_vcs_prompt)
  echo -n -s (set_color $cwd_color) $delim (set_color normal) ' '
end
