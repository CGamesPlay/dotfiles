# This file is executed by tasks/20-fish.sh. It should only set default values
# and not overwrite anything.
cd (readlink ~/.config/fish/defaults.fish)/../../../..

set -Uq DFM_DIR; or set -U DFM_DIR (pwd)
set -Uq beep_command || set -U beep_command '@iterm play-sound Factorio/alert-destroyed.wav'

# https://fishshell.com/docs/current/prompt.html#transient-prompt
set -U fish_transient_prompt 1

# Unset all color-related default variables
for var in (set -Un | string match -re '^fish_(?:pager_)?color')
	set -Ue $var
end
fish_config theme choose "Rose Pine ANSI"
for var in (set -gn | string match -re '^fish_(?:pager_)?color')
	set -U $var $$var
end
