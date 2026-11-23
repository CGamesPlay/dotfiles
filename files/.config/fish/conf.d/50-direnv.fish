# Set up direnv in interactive shells if it is installed

if ! status is-interactive; or ! command -q direnv 2>/dev/null
  exit
end

direnv hook fish | source
direnv export fish | source
