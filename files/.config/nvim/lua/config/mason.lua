-- mason.nvim is a Neovim plugin that allows you to easily manage external
-- editor tooling such as LSP servers, DAP servers, linters, and formatters
-- through a single interface
return {
  "williamboman/mason.nvim",
  version = "*",
  lazy = true,
  opts = {
    -- Append so that project-specific versions of tools alwasy take
    -- precedence.
    PATH = "append",
  },
}
