#!/bin/sh
# Install nvim unstable from PPA
set -e

# shellcheck disable=SC1091
. /etc/lsb-release

sudo mkdir -p /etc/apt/keyrings

curl -fsSL 'https://keyserver.ubuntu.com/pks/lookup?op=get&search=0x9DBB0BE9366964F134855E2255F96FCF8231B6DD' | sudo tee /etc/apt/keyrings/ppa-neovim-ppa.asc >/dev/null

sudo tee /etc/apt/sources.list.d/ppa-neovim-ppa-unstable.sources >/dev/null <<EOF
Types: deb
URIs: https://ppa.launchpadcontent.net/neovim-ppa/unstable/ubuntu
Suites: $DISTRIB_CODENAME
Components: main
Signed-By: /etc/apt/keyrings/ppa-neovim-ppa.asc

Types: deb-src
URIs: https://ppa.launchpadcontent.net/neovim-ppa/unstable/ubuntu
Suites: $DISTRIB_CODENAME
Components: main
Signed-By: /etc/apt/keyrings/ppa-neovim-ppa.asc
EOF

# Update the package list
sudo apt-get update -o Dir::Etc::sourcelist="sources.list.d/ppa-neovim-ppa-unstable.sources" -o Dir::Etc::sourceparts="-" -o APT::Get::List-Cleanup="0"

# Install nvim
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y neovim
