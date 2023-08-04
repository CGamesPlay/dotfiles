# This file is executed by tasks/20-fish.sh. It should only set default values
# and not overwrite anything.
set -Uq DFM_DIR || set -U DFM_DIR (cd (readlink ~/.config/fish/defaults.fish)/../../../..; pwd)
cd (readlink ~/.config/fish/defaults.fish)/../../../..
set -Uq fish_color_autosuggestion || set -U fish_color_autosuggestion 3BA3D0
set -Uq fish_color_cancel || set -U fish_color_cancel --reverse
set -Uq fish_color_command || set -U fish_color_command 0772A1
set -Uq fish_color_comment || set -U fish_color_comment FFE100
set -Uq fish_color_cwd || set -U fish_color_cwd 'green'  '--bold'
set -Uq fish_color_cwd_root || set -U fish_color_cwd_root red
set -Uq fish_color_end || set -U fish_color_end 8D003B
set -Uq fish_color_error || set -U fish_color_error EC3B86
set -Uq fish_color_escape || set -U fish_color_escape 00a6b2
set -Uq fish_color_history_current || set -U fish_color_history_current --bold
set -Uq fish_color_host || set -U fish_color_host 'blue'  '--bold'
set -Uq fish_color_host_remote || set -U fish_color_host_remote yellow
set -Uq fish_color_match || set -U fish_color_match --background=brblue
set -Uq fish_color_normal || set -U fish_color_normal normal
set -Uq fish_color_operator || set -U fish_color_operator 00a6b2
set -Uq fish_color_param || set -U fish_color_param 225E79
set -Uq fish_color_quote || set -U fish_color_quote 024A68
set -Uq fish_color_redirection || set -U fish_color_redirection 63AFD0
set -Uq fish_color_search_match || set -U fish_color_search_match 'bryellow'  '--background=brblack'
set -Uq fish_color_selection || set -U fish_color_selection 'white'  '--bold'  '--background=brblack'
set -Uq fish_color_status || set -U fish_color_status red
set -Uq fish_color_user || set -U fish_color_user 'blue'  '--bold'
set -Uq fish_color_valid_path || set -U fish_color_valid_path --underline
exit 0
