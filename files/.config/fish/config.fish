set -x EDITOR vim
set -x LESS "-RSF"
set -x PATH ./node_modules/.bin $PATH

if ! set -q XDG_CACHE_HOME
  if [ (uname -s) = "Darwin" ]
    set -x XDG_CACHE_HOME ~/Library/Caches/org.freedesktop
  else
    set -x XDG_CACHE_HOME ~/.cache
  end
end

# Clear fzf's ^T binding to leave transpose alone, and use ^P instead
bind -e \ct
bind \cp fzf-file-widget
