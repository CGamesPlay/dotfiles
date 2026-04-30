# Dotfiles Repository

This repository is organized as follows:

- `files/` the main, cross-platform DFM repo
- `macos/` the macos-specific DFM repo
- `linux/` the linux-specific DFM repo
- `tasks/` bootstrap scripts for installing dotfiles on new machines
- `devserver/` Hetzner Bootable Volume scripts, depends on the dotfiles repo but is usable standalone.
- `scripts/` maintenance scripts for the dotfiles repo itself
- `share/` data used by custom dotfiles scripts, test fixtures, etc.
- `share/pi` pi package containing all custom extensions
- `files/.agents/skills` system-wide, cross-agent skills

DFM works by symlinking files from the DFM repos into the home directory. For example, `~/.config/nvim/init.lua` is a symlink to `files/.config/nvim/init.lua`. All files in the repository are linked automatically, there are no additional steps or configuration. `dfm link` is the only command necessary, and is always safe to run.

If DFM gives "operation not permitted" errors, it's because the sandbox environment is enabled and restricting your operations. If this is blocking, ask Ryan to do the commands or to disable the sandbox.

I use `@` as a prefix to several custom scripts in ~/.local/bin (so, located in one of files, macos, or linux directories under .local/bin).

Make sure to read the README.md file in this directory for information about testing.
