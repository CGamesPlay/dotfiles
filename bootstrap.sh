#!/bin/sh
set -e

cd "$(dirname "$0")"
for script in $(ls ./tasks/*.sh | sort); do
  echo "Running $script..."
  "$script"
done
