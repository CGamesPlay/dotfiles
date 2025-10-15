#!/bin/sh
# Migrate from fasd to zoxide
set -e

if [ -e ~/.fasd ]; then
	zoxide import --from=fasd ~/.fasd
	rm ~/.fasd
fi
