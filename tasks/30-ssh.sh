#!/bin/sh
# Create a basic ~/.ssh/config file if one does not already exist
set -e

[ -e ~/.ssh/config ] && exit 0

cat >~/.ssh/config <<EOF 
# Machine-local SSH config

# Put machine-local SSH configuration above this line. Any settings that
# should be tracked by DFM should be placed in this file.
Include "config.shared"
EOF
