function iterm_open_url
  # https://gitlab.com/gnachman/iterm2/-/commit/fc9ae5c90f53cb1ed54d338a3bf1e09f22d22894
  printf "\033]1337;Custom=id=%s:%s\a" "open-url" $argv
end
