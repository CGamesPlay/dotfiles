# This file is executed by tasks/20-fish.sh. It should only set default values
# and not overwrite anything.
set -Uq DFM_DIR || set -U DFM_DIR (cd (readlink ~/.config/fish/defaults.fish)/../../../..; pwd)
cd (readlink ~/.config/fish/defaults.fish)/../../../..
set -Uq beep_command || set -U beep_command '@iterm play-sound Factorio/alert-destroyed.wav'
exit 0
