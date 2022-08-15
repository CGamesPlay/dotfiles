# Defined in /var/folders/2r/0y4kz7r53y1bflwy7l87z4n40000gn/T//fish.O2r1NE/stop_freelancing.fish @ line 2
function stop_freelancing
  echo "Unsetting DOCKER_HOST universally"
  set -Ux DOCKER_HOST
  echo "Disconnecting VPN"
  networksetup -disconnectpppoeservice "Dev Server"
  echo "Stopping Dev Server"
  devserver stop
end
