# Defined in /var/folders/2r/0y4kz7r53y1bflwy7l87z4n40000gn/T//fish.W6pXRi/start_freelancing.fish @ line 2
function start_freelancing
	echo "Starting Dev Server"
  devserver start || return $status
  echo "Connecting VPN"
  networksetup -connectpppoeservice "Dev Server"
  echo "Setting DOCKER_HOST (universally)"
  set -Ux DOCKER_HOST tcp://10.254.0.1:2375
end
