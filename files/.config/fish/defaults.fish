# This file is executed by tasks/30-fish.sh. It should only set default values
# and not overwrite anything.
cd (readlink ~/.config/fish/defaults.fish)/../../../..

set -Uq DFM_DIR; or set -U DFM_DIR (pwd)
set -Uq beep_command || set -U beep_command '@iterm play-sound Factorio/alert-destroyed.wav'

# https://fishshell.com/docs/current/prompt.html#transient-prompt
set -U fish_transient_prompt 1

true
