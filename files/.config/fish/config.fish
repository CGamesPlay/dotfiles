set -x EDITOR vim
set -x LESS "-RSF"
set -x PATH ./node_modules/.bin $PATH

# Clear fzf's ^T binding to leave transpose alone, and use ^P instead
bind \ct
bind \cp fzf-file-widget
