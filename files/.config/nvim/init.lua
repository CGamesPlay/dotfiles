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

-- [[ Loading config files ]]
-- Config is split into multiple files, the order that these are loaded is
-- important.
require("config.basic")
require("config.lazy")
require("config.neovide")
