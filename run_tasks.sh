#!/bin/sh
set -e

cd "$(dirname "$0")"
ls ./tasks/*.sh | sort | while read script; do
  "$script"
done
