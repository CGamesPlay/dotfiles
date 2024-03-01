# When inside of an SSH connection, establish a well-known location for
# SSH_AUTH_SOCK, so that sessions in tmux or devcontainers can keep using the
# same socket address even through reconnections.
# Note that the location of SSH_AUTH_SOCK is hard-coded to be in /tmp:
# https://github.com/openssh/openssh-portable/blob/01dbf3d46651b7d6ddf5e45d233839bbfffaeaec/session.c#L184
if set -q SSH_CONNECTION && set -q SSH_AUTH_SOCK && test (basename $SSH_AUTH_SOCK) != ssh-auth.sock
    set -l base_dir /tmp/ssh-(id -u)
    mkdir -p $base_dir
    chmod 700 $base_dir
    ln -f $SSH_AUTH_SOCK $base_dir/ssh-auth.sock
    set -x SSH_AUTH_SOCK $base_dir/ssh-auth.sock
end

# Also, check if there already is a socket in the expected location but the
# environment variable isn't set (e.g. in a devcontainer).
if ! set -q SSH_AUTH_SOCK && test -S /tmp/ssh-(id -u)/ssh-auth.sock
    set -x SSH_AUTH_SOCK /tmp/ssh-(id -u)/ssh-auth.sock
end
