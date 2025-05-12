-- This is the main entry point for my nvim config, but most of the interesting
-- configuration happens in lua/config/.

-- [[ XDG Environment setup ]]
-- Set these variables to sane defaults. On Linux they should already be set,
-- but MacOS doesn't provide them by default.
if vim.env.XDG_CONFIG_HOME == nil or vim.env.XDG_CONFIG_HOME == "" then
  vim.env.XDG_CONFIG_HOME = vim.fn.expand("$HOME/.config")
end

if vim.env.XDG_CACHE_HOME == nil or vim.env.XDG_CACHE_HOME == "" then
  if vim.uv.os_uname().sysname == "Darwin" or vim.fn.has("macunix") == 1 then
    vim.env.XDG_CACHE_HOME = vim.fn.expand("$HOME/Library/Caches/org.freedesktop")
  else
    vim.env.XDG_CACHE_HOME = vim.fn.expand("$HOME/.cache")
  end
end

-- [[ Install lazy.nvim ]]
-- Install the plugin manager itself, if it isn't already installed.
local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not (vim.uv or vim.loop).fs_stat(lazypath) then
  local lazyrepo = "https://github.com/folke/lazy.nvim.git"
  local out = vim.fn.system({ "git", "clone", "--filter=blob:none", "--branch=stable", lazyrepo, lazypath })
  if vim.v.shell_error ~= 0 then
    vim.api.nvim_echo({
      { "Failed to clone lazy.nvim:\n", "ErrorMsg" },
      { out,                            "WarningMsg" },
      { "\nPress any key to exit..." },
    }, true, {})
    vim.fn.getchar()
    os.exit(1)
  end
end
vim.opt.rtp:prepend(lazypath)

-- [[ Set Up lazy.nvim ]]

-- Lazy requires that this is set before any plugins are loaded, and that it is
-- never changed.
vim.g.mapleader = ","
vim.g.maplocalleader = ","

require("lazy").setup({
  spec = {
    { import = "config" },
  },
  -- Configure any other settings here. See the documentation for more details.
  -- colorscheme that will be used when installing plugins.
  install = { colorscheme = { "habamax" } },
  -- if I am not trying to do an immediate edit, check for plugin updates
  checker = { enabled = vim.fn.argc() == 0 },
  -- disable luarocks (consider adding back later)
  rocks = { enabled = false },
  ui = {
    icons = {
      cmd = "⌘",
      config = "🛠",
      event = "📅",
      ft = "📂",
      init = "⚙",
      keys = "🗝",
      plugin = "🔌",
      runtime = "💻",
      require = "🌙",
      source = "📄",
      start = "🚀",
      task = "📌",
      lazy = "💤 ",
    },
  },
  performance = {
    -- Lazy resets the value of rtp by default, I guess for performance
    -- reasons, but this breaks the Ubuntu PPA of Neovim, which stores
    -- tree-sitter parsers in a different directory.
    rtp = { reset = false },
  },
})
