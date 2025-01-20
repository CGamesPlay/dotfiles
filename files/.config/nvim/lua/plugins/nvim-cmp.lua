-- A completion engine plugin for neovim written in Lua. Completion sources are installed from external repositories and "sourced".
return {
  "hrsh7th/nvim-cmp",
  version = "*",
  dependencies = {
    "hrsh7th/cmp-nvim-lsp",
    "hrsh7th/cmp-path",
    "hrsh7th/cmp-buffer",
    "hrsh7th/cmp-cmdline",
  },
  event = "VeryLazy", -- Always load to get cmdline completion
  config = function()
    local cmp = require("cmp")
    cmp.setup({
      sources = {
        { name = "nvim_lsp" },
        { name = "buffer" },
      },
      snippet = {
        expand = function(args)
          vim.snippet.expand(args.body) -- Neovim v0.10+
        end,
      },
      completion = { autocomplete = false },
      mapping = cmp.mapping.preset.insert({
        -- Default bindings are:
        -- <C-n>/<C-p> to cycle through results
        -- <Down>/<Up> to cycle through results if already displayed
        -- <C-y>/<C-e> to accept/cancel

        -- Use <Tab>/<Esc> as additional accept/cancel bindings
        ["<Tab>"] = { i = cmp.mapping.confirm({ select = false }) },
        ["<Esc>"] = { i = cmp.mapping.abort() },
        ["<Right>"] = { i = cmp.mapping.confirm({ select = false }) },
        ["<Left>"] = { i = cmp.mapping.abort() },

        -- Scroll documentation window
        ["<C-u>"] = { i = cmp.mapping.scroll_docs(-4) },
        ["<C-d>"] = { i = cmp.mapping.scroll_docs(4) },
      }),
    })

    cmp.setup.cmdline({ "/", "?" }, {
      mapping = cmp.mapping.preset.cmdline(),
      sources = {
        { name = "buffer" },
      },
    })

    cmp.setup.cmdline(":", {
      completion = { autocomplete = { "TextChanged" } },
      mapping = cmp.mapping.preset.cmdline(),
      sources = cmp.config.sources({ { name = "path", option = { trailing_slash = true } } }, { { name = "cmdline" } }),
      matching = { disallow_symbol_nonprefix_matching = false },
    })
  end,
}
