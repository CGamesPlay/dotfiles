-- Lightweight yet powerful formatter plugin for Neovim
-- Formatter list at :help conform-formatters

local keys = require("keygroup").new("config.conform")
keys:set("n", "<leader>tf", function()
  local bufnr = vim.api.nvim_get_current_buf()
  vim.b[bufnr].conform_disable = not vim.b[bufnr].conform_disable
  print("Auto-format " .. (vim.b[bufnr].conform_disable and "disabled" or "enabled") .. " for this buffer")
end, { desc = "[T]oggle Auto[f]ormat" })
keys:set("n", "<leader>tF", function()
  vim.g.conform_disable = not vim.g.conform_disable
  print("Auto-format " .. (vim.g.conform_disable and "disabled" or "enabled"))
end, { desc = "[T]oggle Auto[f]ormat (all files)" })

--- The timeout for format_on_save can be set per-buffer with
--- b:conform_timeout, or globally with g:conform_timeout. This is the default
--- value if neither of those is set.
local conform_timeout = 500

return {
  "stevearc/conform.nvim",
  version = "*",
  event = { "BufWritePre" },
  cmd = { "ConformInfo" },
  opts = {
    default_format_opts = {
      -- In general, I prefer lsp formatters since the always-running daemon is
      -- faster than running a separate program.
      lsp_format = "prefer",
    },
    formatters_by_ft = {
      astro = { "prettier" },
      beancount = { "bh_format" },
      css = { "prettier" },
      go = { "gofmt", "goimports" },
      hcl = { "terraform_fmt" },
      javascript = { "prettier" },
      json = { "prettier" },
      jsonc = { "prettier" },
      jsonnet = { "jsonnetfmt" },
      lua = { "stylua" },
      -- Organize imports automatically.
      -- https://github.com/astral-sh/ruff-lsp/issues/335
      python = { "ruff_organize_imports" },
      rust = { "rustfmt" },
      eruby = { "erb_format" },
      terraform = { "terraform_fmt" },
      typescript = { "prettier", lsp_format = "fallback" },
      typescriptreact = { "prettier" },
    },
    formatters = {
      bh_format = {
        command = "bh",
        args = { "format", "$FILENAME" },
        stdin = false,
      },
    },
    format_on_save = function(bufnr)
      -- Disable with a global or buffer-local variable
      if vim.g.conform_disable or vim.b[bufnr].conform_disable then
        return
      end
      return { timeout_ms = vim.b[bufnr].conform_timeout or vim.g.conform_timeout or conform_timeout }
    end,
  },
  init = function()
    -- This enables using gq for range formatting
    vim.o.formatexpr = "v:lua.require'config.conform'.formatexpr()"
  end,

  formatexpr = function()
    local bufnr = vim.api.nvim_get_current_buf()
    return require("conform").formatexpr({
      timeout_ms = vim.b[bufnr].conform_timeout or vim.g.conform_timeout or conform_timeout,
    })
  end,
}
