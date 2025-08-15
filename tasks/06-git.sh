#!/bin/bash
# Set up this repository to verify signatures on pulls
set -e
. "$(dirname "$0")/helpers"

git config gpg.ssh.allowedSignersFile share/authorized_signers
git config merge.verifySignatures true
