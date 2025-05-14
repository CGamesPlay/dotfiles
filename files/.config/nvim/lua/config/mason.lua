-- mason.nvim is a Neovim plugin that allows you to easily manage external
-- editor tooling such as LSP servers, DAP servers, linters, and formatters
-- through a single interface
return {
  "mason-org/mason.nvim",
  version = "*",
  opts = {
    -- Append so that project-specific versions of tools alwasy take
    -- precedence.
    PATH = "append",
  },
}
