# Defined in /var/folders/2r/0y4kz7r53y1bflwy7l87z4n40000gn/T//fish.xeV8iK/start_freelancing.fish @ line 2
function start_freelancing
  echo "Starting Dev Server"
  devserver start || return $status
  echo "Connecting VPN"
  networksetup -connectpppoeservice "Dev Server"
  # Wait for WireGuard service to initialize. Does not verify connection.
  while ! scutil --nc status "Dev Server" | head -1 | grep -q Connected; sleep 1; end
  echo "Verifying connection"
  for i in (seq 1 60)
    if ping -c 1 10.254.0.1 > /dev/null
      break
    end
  end
  if ! ping -c 1 10.254.0.1 > /dev/null
    echo "WireGuard is not connected"
    return 1
  end
  echo "Waiting for docker"
  while ! nc -z 10.254.0.1 2375; sleep 1; end
  echo "Setting DOCKER_HOST (universally)"
  set -Ux DOCKER_HOST tcp://10.254.0.1:2375
end
