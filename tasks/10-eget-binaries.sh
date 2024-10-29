#!/bin/bash
# Install binaries using eget (only ones which should always be available).
set -ueo pipefail

eget CGamesPlay/dfm --upgrade-only --to=~/.local/bin
eget sigoden/argc --upgrade-only --to=~/.local/bin
