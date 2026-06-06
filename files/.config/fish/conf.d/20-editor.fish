if command -q nvim
  set -x EDITOR nvim
else
  set -x EDITOR vim
end
set -x LESS "-RSF"
set -x BAT_THEME ansi

