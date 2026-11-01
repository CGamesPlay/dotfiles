-- https://github.com/nvim-lualine/lualine.nvim
-- A blazing fast and easy to configure neovim statusline plugin written in
-- pure lua.

local my_mode = {
  "mode",
  fmt = function(val)
    return ({
      COMMAND = "CMD",
      INSERT = "INS",
      NORMAL = "NRM",
      REPLACE = "RPL",
      TERMINAL = "TRM",
      VISUAL = "VIS",
      ["O-PENDING"] = "OPP",
      ["V-BLOCK"] = "VIB",
      ["V-LINE"] = "VIL",
    })[val] or val
  end,
}

local function theme()
  local inkwell = require("inkwell")
  local c = inkwell.roles(vim.g.colors_name, inkwell.background or vim.o.background)
  local M = {
    normal = {
      a = { fg = c.brand_text, bg = c.brand, gui = "bold" },
      b = { fg = c.text, bg = c.overlay },
      c = { fg = c.text, bg = c.surface },
    },
    insert = { a = { fg = c.surface, bg = c.success, gui = "bold" } },
    visual = { a = { fg = c.surface, bg = c.warning, gui = "bold" } },
    replace = { a = { fg = c.surface, bg = c.danger, gui = "bold" } },
    inactive = {
      a = { fg = c.muted, bg = c.overlay, gui = "bold" },
      b = { fg = c.muted, bg = c.surface },
      c = { fg = c.muted, bg = c.surface },
    },
  }
  M.terminal = M.insert
  return M
end

return {
  "nvim-lualine/lualine.nvim",
  lazy = false,
  config = function(_, opts)
    local function setup()
      opts.options.theme = theme()
      require("lualine").setup(opts)
    end
    setup()
    vim.api.nvim_create_autocmd("ColorScheme", {
      desc = "Rebuild the lualine theme for the new background",
      group = vim.api.nvim_create_augroup("config.lualine", { clear = true }),
      pattern = { "linen", "cotton" },
      callback = setup,
    })
  end,
  opts = {
    options = {
      icons_enabled = false,
    },
    sections = {
      lualine_a = { my_mode },
      lualine_b = { "diagnostics" },
      lualine_c = { { "filename", path = 1 } },
      lualine_x = { "progress", "location" },
      lualine_y = { "lsp_status" },
      lualine_z = { "filetype" },
    },
    inactive_sections = {
      lualine_a = { my_mode },
      lualine_b = {},
      lualine_c = { { "filename", path = 1 } },
      lualine_x = { "progress", "location" },
      lualine_y = {},
      lualine_z = { "filetype" },
    },
  },
}
