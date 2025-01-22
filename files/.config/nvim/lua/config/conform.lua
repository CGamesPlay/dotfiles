-- Lightweight yet powerful formatter plugin for Neovim
-- Formatter list at :help conform-formatters

local keys = require("keygroup").new("config.conform")
keys:set("n", "<leader>tf", function()
  local bufnr = vim.api.nvim_get_current_buf()
  vim.b[bufnr].conform_disable = not vim.b[bufnr].conform_disable
end, { desc = "[T]oggle Auto[f]ormat" })
keys:set("n", "<leader>tF", function()
  vim.g.conform_disable = not vim.g.conform_disable
end, { desc = "[T]oggle Auto[f]ormat (all files)" })

return {
  "stevearc/conform.nvim",
  version = "*",
  event = { "BufWritePre" },
  cmd = { "ConformInfo" },
  opts = {
    formatters_by_ft = {
      astro = { "prettier" },
      css = { "prettier" },
      go = { "gofmt", "goimports" },
      hcl = { "terraform_hclfmt" },
      javascript = { "prettier" },
      json = { "prettier" },
      jsonc = { "prettier" },
      lua = { "stylua" },
      python = { "ruff" },
      ruby = { "standardrb" },
      rust = { "rustfmt" },
      terraform = { "terraform_fmt" },
      typescript = { "prettier" },
    },
    -- formatters = {
    --   stylua = {
    --     prepend_args = { "--foo=bar" },
    --   },
    -- },
    default_format_opts = {
      lsp_format = "fallback",
    },
    format_on_save = function(bufnr)
      -- Disable with a global or buffer-local variable
      if vim.g.conform_disable or vim.b[bufnr].conform_disable then
        return
      end
      return { timeout_ms = vim.b[bufnr].conform_timeout or vim.g.conform_timeout }
    end,
  },
  init = function()
    -- This enables using gq for range formatting
    vim.o.formatexpr = "v:lua.require'plugins.conform'.formatexpr()"
    vim.g.conform_timeout = 1000
  end,
  keys = keys:lazy_keys(),

  formatexpr = function()
    local bufnr = vim.api.nvim_get_current_buf()
    return require("conform").formatexpr({ timeout_ms = vim.b[bufnr].conform_timeout or vim.g.conform_timeout })
  end,
}
