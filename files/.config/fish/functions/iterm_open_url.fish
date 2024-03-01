function iterm_open_url
  printf "\033]1337;Custom=id=%s:%s\a" "open-url" $argv
end
