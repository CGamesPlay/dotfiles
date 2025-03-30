-- https://github.com/stevearc/oil.nvim
-- Neovim file explorer: edit your filesystem like a buffer
local keys = require("keygroup").new("config.oil")

keys:set("n", "-", "<Cmd>Oil<CR>", { desc = "Open parent directory" })

local detail = false

return {
  "stevearc/oil.nvim",
  version = "2.15.0",
  dependencies = { "nvim-tree/nvim-web-devicons" },
  lazy = false, -- Cannot be lazy becuase we want to be able to run `nvim .`
  opts = {
    keymaps = {
      ["g."] = false,
      ["<C-h>"] = false,
      ["<C-p>"] = false,
      ["<C-s>"] = false,
      ["<C-t>"] = false,
      ["<leader>t."] = {
        desc = "Oil: [T]oggle Hidden ([.]) files",
        callback = "actions.toggle_hidden",
      },
      ["<leader>tc"] = {
        desc = "Oil: [T]oggle Detail [C]olumns",
        callback = function()
          detail = not detail
          if detail then
            require("oil").set_columns({ "icon", "permissions", "size", "mtime" })
          else
            require("oil").set_columns({ "icon" })
          end
        end,
      },
      ["<leader>tp"] = {
        desc = "Oil: [T]oggle [P]review",
        callback = "actions.preview",
      },
    },
  },
}
