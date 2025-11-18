# These need to be set up before 50-direnv, or else they will get lost.
if command -q nvim
  set -x EDITOR nvim
else
  set -x EDITOR vim
end
set -x LESS "-RSF"
set -x BAT_THEME ansi

if ! set -q XDG_CACHE_HOME
  if [ (uname -s) = "Darwin" ]
    set -x XDG_CACHE_HOME ~/Library/Caches/org.freedesktop
  else
    set -x XDG_CACHE_HOME ~/.cache
  end
end
if ! set -q XDG_DATA_HOME
  set -x XDG_DATA_HOME ~/.local/share
end
if ! set -q XDG_CONFIG_HOME
  set -x XDG_CONFIG_HOME ~/.config
end
if ! set -q XDG_STATE_HOME
  set -x XDG_STATE_HOME ~/.local/state
end
if ! set -q XDG_RUNTIME_DIR
  set -x XDG_RUNTIME_DIR $TMPDIR
end
if ! set -q XDG_BIN_HOME
  set -x XDG_BIN_HOME ~/.local/bin
end
