function iterm_open_url
  # https://gitlab.com/gnachman/iterm2/-/commit/fc9ae5c90f53cb1ed54d338a3bf1e09f22d22894
  set -l url (printf '%s' $argv | base64 | tr -d '\n')
  printf "\033]1337;OpenURL=:%s\a" "$url"
end
