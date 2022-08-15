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


