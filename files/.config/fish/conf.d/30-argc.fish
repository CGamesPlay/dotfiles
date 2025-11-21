if ! command -q argc 2>/dev/null
  exit
end

# Generate completions for argc and my custom Argcfiles
argc --argc-completions fish @argc @get @iterm @devcontainer claude | source
