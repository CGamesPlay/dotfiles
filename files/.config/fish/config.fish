# Clear fzf's ^T binding to leave transpose alone, and use ^P instead
bind -e \ct
bind \cp fzf-file-widget

# https://fishshell.com/docs/current/prompt.html#transient-prompt
# I do not change visual appearance of the prompt, but I do like that it
# updates the time before starting the command.
set -g fish_transient_prompt 1

fish_config theme choose "Rose Pine ANSI"
