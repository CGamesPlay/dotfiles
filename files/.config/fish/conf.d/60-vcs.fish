function vcs_update --on-event fish_postexec --description "Sync version control before printing prompt"
  if command -q jj
    jj debug snapshot &>/dev/null
  end
end
