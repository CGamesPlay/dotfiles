function iterm2_print_user_vars --description "Called automatically by iTerm shell integration"
  if set -q ATRIUM_WORKSPACE
    iterm2_set_user_var atrium $ATRIUM_WORKSPACE
  else if set -q ATRIUM_MACHINE
    iterm2_set_user_var atrium "machine:$ATRIUM_MACHINE"
  else
    iterm2_set_user_var atrium ""
  end
  iterm2_set_user_var atEnv $ATENV_NAME
end
