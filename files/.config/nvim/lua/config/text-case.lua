-- An all in one plugin for converting text case in Neovim. It converts a piece of text to an indicated string case and also is capable of bulk replacing texts without changing cases.
-- You can use visual mode selection, "cr<.>" to handle current word, or "cro<.><op>" to handle a text object (crcoi' -> case replace camelCase operator in single-quote)

return {
  "johmsalas/text-case.nvim",
  dependencies = { "nvim-telescope/telescope.nvim" },
  opts = {
    prefix = "cr",
  },
  config = function(_, opts)
    require("textcase").setup(opts)
    require("telescope").load_extension("textcase")
  end,
  -- Eager load so that the interactive Subs feature is always available.
  event = "VeryLazy",
}
