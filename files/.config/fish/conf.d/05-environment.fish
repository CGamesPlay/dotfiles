# These need to be set up before 50-direnv, or else they will get lost.
set -x EDITOR vim
set -x LESS "-RSF"

if ! set -q XDG_CACHE_HOME
  if [ (uname -s) = "Darwin" ]
    set -x XDG_CACHE_HOME ~/Library/Caches/org.freedesktop
  else
    set -x XDG_CACHE_HOME ~/.cache
  end
end

# When inside of an SSH connection, establish a well-known location for
# SSH_AUTH_SOCK, so that sessions in tmux can keep using the same socket address
# even through reconnections.
if set -q SSH_CONNECTION && test $SSH_AUTH_SOCK != ~/.ssh/latest_auth_sock
  ln -sf $SSH_AUTH_SOCK ~/.ssh/latest_auth_sock
  set -x SSH_AUTH_SOCK ~/.ssh/latest_auth_sock
end
