#!/usr/bin/env fish
# This script generates 05-eget.sh from the latest on github.

cd (dirname (status -f))/..
set target tasks/05-eget.sh

echo "#!/bin/bash
# This script is generated using "(status -f)"

if [ -x ~/.local/bin/eget ]; then exit 0; fi">$target
curl -sSL https://zyedidia.github.io/eget.sh | tail +2 >>$target
echo "
mkdir -p ~/.local/bin
mv eget ~/.local/bin/
" >>$target
chmod +x $target
echo "$target updated"
