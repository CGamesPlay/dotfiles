--------------------------------------------------------------------------------
--- Ensure XDG environment variables are set up
--------------------------------------------------------------------------------
-- Set these variables to sane defaults. On Linux they should already be set,
-- but MacOS doesn't provide them by default.
if vim.env.XDG_CONFIG_HOME == nil or vim.env.XDG_CONFIG_HOME == "" then
  vim.env.XDG_CONFIG_HOME = vim.fn.expand("$HOME/.config")
end

if vim.env.XDG_CACHE_HOME == nil or vim.env.XDG_CACHE_HOME == "" then
  if vim.loop.os_uname().sysname == "Darwin" or vim.fn.has('macunix') == 1 then
    vim.env.XDG_CACHE_HOME = vim.fn.expand("$HOME/Library/Caches/org.freedesktop")
  else
    vim.env.XDG_CACHE_HOME = vim.fn.expand("$HOME/.cache")
  end
end

-- Set where the Neovim config files are stored
vim.opt.runtimepath:prepend(vim.env.XDG_CONFIG_HOME .. "/vim")
vim.opt.runtimepath:append(vim.env.XDG_CONFIG_HOME .. "/vim/after")

-- First load my base vimrc
vim.cmd("source " .. vim.env.XDG_CONFIG_HOME .. "/vim/vimrc")

if vim.g.neovide then
  dofile(vim.env.XDG_CONFIG_HOME .. "/nvim/neovide.lua")
end
