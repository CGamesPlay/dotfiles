fish_config theme choose "Rose Pine ANSI"

# Fish has various heuristics to check for truecolor terminal support, but it
# doesn't pass the results into the environment.
# https://github.com/fish-shell/fish-shell/blob/60ab561be1a2e67dcebbedca4845ada105fcd5c8/src/env_dispatch.rs#L373
if set_color 123 | string match -qr '38;2;'
  set -x COLORTERM truecolor
end
