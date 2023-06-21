" The real vimrc lives in ~/.config/vim/vimrc. This is simply a shim to have vim
" use XDG environment variables for configuration.

" Set these variables to sane defaults. On Linux they should already be set, but
" MacOS doesn't provide them by default.
if empty($XDG_CONFIG_HOME)
  let $XDG_CONFIG_HOME = expand("$HOME/.config")
end
if empty($XDG_CACHE_HOME)
  if has('macunix')
    let $XDG_CACHE_HOME = expand("$HOME/Library/Caches/org.freedesktop")
  else
    let $XDG_CACHE_HOME = expand("$HOME/.cache")
  end
end

" Set where the vim config files are stored
set runtimepath=$XDG_CONFIG_HOME/vim,$VIM,$VIMRUNTIME,$XDG_CONFIG_HOME/vim/after

" Jump into the real vimrc.
source $XDG_CONFIG_HOME/vim/vimrc
