# This file is executed by tasks/30-fish.sh. It should only set default values
# and not overwrite anything.
cd (readlink ~/.config/fish/defaults.fish)/../../../..


set -Uq DFM_DIR; or set -U DFM_DIR (pwd)
set -Uq beep_command || set -U beep_command '@iterm play-sound Factorio/alert-destroyed.wav'

# https://fishshell.com/docs/current/prompt.html#transient-prompt
set -U fish_transient_prompt 1

# When this file is run from the bootstrap scripts, fish has never been run
# before. If this variable isn't set, fish will overwrite a bunch of colors
# with the defaults. When the color scheme changes, the expected version should
# be updated.
if ! set -q __fish_initialized || test $__fish_initialized -lt 3800
	set -U __fish_initialized 3800
end

# Unset all color-related default variables
for var in (set -Un | string match -re '^fish_(?:pager_)?color')
	set -Ue $var
end
fish_config theme choose "Rose Pine ANSI"
for var in (set -gn | string match -re '^fish_(?:pager_)?color')
	set -U $var $$var
end

