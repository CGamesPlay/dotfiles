set -g prompt_status_generation $status_generation
set -g async_prompt_status_generation ""
set -g async_prompt_var "async_prompt_$fish_pid"
set -ge async_prompt_loading
set -g async_prompt_saved ""

# The prompt is composed of 3 parts: sync, async, and indicator. Renders like:
#
#   $sync_part$async_part
#   $indicator
#
# The async part is refreshed in the background, and its previous value is
# shown during this time (grayed). It is also updated to gray after the final
# rendering.
function fish_prompt --description 'Write out the prompt'
  if test "$async_prompt_status_generation" != "$status_generation"
    set -g async_prompt_status_generation $status_generation
    async_prompt_refresh
  end

  prompt_part_sync
  if set -q async_prompt_loading; or contains -- --final-rendering $argv
    set_color normal --dim
    echo -n "$async_prompt_saved" | string replace -ar '\x1b\[[0-9;]*[JKmsu]' ''
    set_color normal
  else
    echo -n $async_prompt_saved
    set_color normal
  end
  echo
  prompt_part_indicator
end

function async_prompt_refresh --description 'Asynchronously update the value of async_prompt_saved'
  # First, kill any outdated processes
  set -q async_prompt_pid; and kill $async_prompt_pid &>/dev/null
  fish -c "set -U $async_prompt_var (prompt_part_async)" &
  set -g async_prompt_pid $last_pid
  set -g async_prompt_loading
end

# Listen for changes to the async_prompt_var and repaint the command line
function async_prompt_var --on-var $async_prompt_var
  if set -q $async_prompt_var
    set -g async_prompt_saved "$$async_prompt_var"
    set -ge async_prompt_loading
    set -Ue $async_prompt_var
    commandline --function repaint
  end
end

function prompt_part_async --description 'Write out the async part of the prompt'
  echo -n " "
  fish_vcs_prompt
end

function prompt_part_sync --description 'Write out the sync part of the prompt'
  # If an atrium name is given, print that as the hostname
  if not set -q fish_color_host_remote
    set -g fish_color_host_remote normal
  end
  if set -q CODER
    set -f host (set_color $fish_color_host_remote)"$CODER_WORKSPACE_AGENT_NAME.$CODER_WORKSPACE_NAME"
  else if set -q ATRIUM_WORKSPACE
    set -f host (set_color $fish_color_host_remote)$ATRIUM_WORKSPACE
  else if set -q ATRIUM_MACHINE
    set -f host (set_color $fish_color_host_remote)machine:$ATRIUM_MACHINE
  else
    set -f host (set_color $fish_color_host)(prompt_hostname)
  end

  if test $USER = root
    set -f user_at (set_color $fish_color_user)"$USER@"(set_color normal)
  end

  echo -n -s \
    (set_color $fish_color_date) (date "+%Y-%m-%d %H:%M") '  ' \
    $user_at $host '  ' \
    (set_color $fish_color_cwd) (prompt_pwd -D 2)
end

function prompt_part_indicator --description 'Write out the indicator part of the prompt'
  if test $USER = root
    set -f delim '#'
  else
    set -f delim '$'
  end

  # Required for iTerm2 to be able to select command output
  set -f osc_marker (printf "\x1b]133;B\a")

  echo -n -s (set_color $fish_color_cwd) $delim (set_color normal) ' ' $osc_marker
end

function prompt_postexec --on-event fish_postexec
  set -f last_pipestatus $pipestatus

  # Print out an empty line at the end of every command.
  echo

  # $status_generation means that $status changed, means that an actual command
  # was run. So this part will ignore updates from builtins like "set".
  if not test $prompt_status_generation = $status_generation
    # Format pipestatus
    set -f brace_color (set_color $fish_color_status)
    set -f prompt_pipestatus (__fish_print_pipestatus "Command failed: [" "]" "|" "$brace_color" "$brace_color" $last_pipestatus)

    # Format command duration
    if test $CMD_DURATION -gt 3600000
      set -f prompt_duration (printf '%sTook %sh%sm%.3fs' \
        (set_color $fish_color_comment) \
        (math -s0 "$CMD_DURATION / 3600000") \
        (math -s0 "($CMD_DURATION % 3600000) / 60000") \
        (math -s3 "($CMD_DURATION % 60000) / 1000"))
    else if test $CMD_DURATION -gt 60000
      set -f prompt_duration (printf '%sTook %sm%.3fs' \
        (set_color $fish_color_comment) \
        (math -s0 "$CMD_DURATION / 60000") \
        (math -s3 "($CMD_DURATION % 60000) / 1000"))
    else if test $CMD_DURATION -gt 1000
      set -f prompt_duration (printf '%sTook %.3fs' \
        (set_color $fish_color_comment) \
        (math -s3 "$CMD_DURATION / 1000"))
    end

    string join -n "  " $prompt_pipestatus $prompt_duration
  end
  set prompt_status_generation $status_generation
end
