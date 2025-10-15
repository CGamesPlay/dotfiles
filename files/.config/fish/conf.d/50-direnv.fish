# Set up direnv if it is installed

if ! command -q direnv 2>/dev/null
  exit
end

direnv hook fish | source
direnv export fish | source
