function port --wraps port
  if contains -- $argv install uninstall reclaim select activate deactivate setrequested unsetrequested setunrequested sync upgrade rev-upgrade clean mirror selfupdate load unload reload
    sudo port $argv
  else
    command port $argv
  end
end
