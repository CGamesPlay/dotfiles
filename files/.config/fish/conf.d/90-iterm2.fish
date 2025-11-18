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
  printf "\x1b]1337;RemoteHost=%s@%s\a\x1b]1337;CurrentDir=%s\a" $USER $hostname $PWD

  if set -q ATRIUM_WORKSPACE
    iterm2_set_user_var atrium $ATRIUM_WORKSPACE
  else if set -q ATRIUM_MACHINE
    iterm2_set_user_var atrium "machine:$ATRIUM_MACHINE"
  else
    iterm2_set_user_var atrium ""
  end
  iterm2_set_user_var atEnv $ATENV_NAME
end
iterm2_refresh_vars
