if ! command -qs argc 2>/dev/null
  exit
end

# Generate completions for argc and my custom .argc
argc --argc-completions fish .argc @env @get | source
