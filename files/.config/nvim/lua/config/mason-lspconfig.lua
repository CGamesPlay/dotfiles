-- mason-lspconfig.nvim closes some gaps that exist between mason.nvim and
-- lspconfig. Its main responsibilities are to:
-- - register a setup hook with lspconfig that ensures servers installed with
--   mason.nvim are set up with the necessary configuration
-- - provide extra convenience APIs such as the :LspInstall command
-- - allow you to (i) automatically install, and (ii) automatically set up a
--   predefined list of servers
-- - translate between lspconfig server names and mason.nvim package names
--   (e.g. lua_ls <-> lua-language-server)
return {
  "williamboman/mason-lspconfig.nvim",
  version = "*",
  dependencies = { "williamboman/mason.nvim" },
  lazy = true,
  opts = {},
}
