-- https://github.com/stevearc/oil.nvim
-- Neovim file explorer: edit your filesystem like a buffer
local keys = require("keygroup").new("config.oil")
local augroup = vim.api.nvim_create_augroup("config.oil", { clear = true })

keys:set("n", "-", "<Cmd>Oil<CR>", { desc = "Open parent directory" })

---@param url string
---@return nil|string
---@return nil|string
local parse_url = function(url)
  return url:match "^.*://(.*)$"
end

vim.api.nvim_create_autocmd("User", {
  desc = "Delete open buffers on file delete",
  group = augroup,
  pattern = "OilActionsPost",
  callback = function(args)
    if args.data.err == nil then
      for _, action in ipairs(args.data.actions) do
        if action.type == "delete" then
          local path = parse_url(action.url)
          local bufnr = vim.fn.bufnr(path)
          if bufnr == -1 then
            return
          end

          local winnr = vim.fn.win_findbuf(bufnr)[1]
          if not winnr then
            vim.cmd("bw " .. bufnr)
          else
            vim.fn.win_execute(winnr, "bp | bw " .. bufnr)
          end
        end
      end
    end
  end,
})

local detail = false

return {
  "stevearc/oil.nvim",
  version = "*",
  dependencies = { "nvim-tree/nvim-web-devicons" },
  lazy = false, -- Cannot be lazy becuase we want to be able to run `nvim .`
  opts = {
    keymaps = {
      ["g."] = false,
      ["<C-h>"] = false,
      ["<C-l>"] = false,
      ["<C-p>"] = false,
      ["<C-s>"] = false,
      ["<C-t>"] = false,
      ["<F5>"] = { callback = "actions.refresh", desc = "Oil: Refresh" },
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
    lsp_file_options = {
      autosave_changes = true,
    }
  },
}
