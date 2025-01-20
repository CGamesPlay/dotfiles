-- Lightweight yet powerful formatter plugin for Neovim
-- Formatter list at :help conform-formatters
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
      if vim.g.disable_autoformat or vim.b[bufnr].disable_autoformat then
        return
      end
      return { timeout_ms = 500 }
    end,
  },
  init = function()
    vim.o.formatexpr = "v:lua.require'conform'.formatexpr()"
  end,
  keys = {
    {
      "<leader>tf",
      function()
        local bufnr = vim.api.nvim_get_current_buf()
        vim.b[bufnr].disable_autoformat = not vim.b[bufnr].disable_autoformat
      end,
      desc = "[T]oggle Auto[f]ormat",
    },
    {
      "<leader>tF",
      function()
        vim.g.disable_autoformat = not vim.g.disable_autoformat
      end,
      desc = "[T]oggle Auto[f]ormat (all files)",
    },
  },
}
