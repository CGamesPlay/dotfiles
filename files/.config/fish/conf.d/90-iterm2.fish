# This adds additional iTerm2-specific customizations.
#
# References:
# - [iTerm2 official integration](https://github.com/gnachman/iTerm2/blob/master/Resources/shell_integration/iterm2_shell_integration.fish)
# - [Fish built-in support](https://github.com/fish-shell/fish-shell/commit/3b9e3e251bf9d4c7d0b31275cac55df68fe0127a)

status --is-interactive; or return

function iterm2_set_user_var
  printf "\x1b]1337;SetUserVar=%s=%s\a" $argv[1] (printf "%s" $argv[2] | base64 | tr -d "\n")
end

function iterm2_refresh_vars --on-event fish_postexec
  printf "\x1b]7;file://%s%s\a" $host (string escape --style=url -- $PWD)

  if set -q CODER
    iterm2_set_user_var atrium ""
    iterm2_set_user_var coder "$CODER_WORKSPACE_AGENT_NAME.$CODER_WORKSPACE_NAME.$CODER_WORKSPACE_OWNER_NAME"
  else if set -q ATRIUM_WORKSPACE
    iterm2_set_user_var atrium $ATRIUM_WORKSPACE
    iterm2_set_user_var coder ""
  else if set -q ATRIUM_MACHINE
    iterm2_set_user_var atrium "machine:$ATRIUM_MACHINE"
    iterm2_set_user_var coder ""
  else
    iterm2_set_user_var atrium ""
    iterm2_set_user_var coder ""
  end
end
iterm2_refresh_vars
