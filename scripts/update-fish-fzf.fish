#!/usr/bin/env fish
# This script generates 20-fzf.fish from the latest on github.

cd (dirname (status -f))/..
set target files/.config/fish/conf.d/20-fzf.fish
curl -sSL https://raw.githubusercontent.com/junegunn/fzf/master/shell/key-bindings.fish -o fzf-key-bindings.fish

echo "# This script is generated using "(status -f)"
# Do not manually modify.

if ! command -qs fzf 2>/dev/null
  exit
end

if command -qs ag 2>/dev/null
  set FZF_CTRL_T_COMMAND 'ag -l .'
end

" | cat >$target
cat fzf-key-bindings.fish >>$target
echo >>$target
echo 'fzf_key_bindings' >>$target

rm fzf-key-bindings.fish
echo "$target updated"
