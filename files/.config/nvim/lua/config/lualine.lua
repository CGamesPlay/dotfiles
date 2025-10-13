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

return {
  "nvim-lualine/lualine.nvim",
  dependencies = { "CGamesPlay/rose-pine-vim", "AndreM222/copilot-lualine" },
  lazy = false,
  opts = {
    options = {
      icons_enabled = false,
      -- theme set set by config.theme
    },
    sections = {
      lualine_a = { my_mode },
      lualine_b = { "diagnostics" },
      lualine_c = { { "filename", path = 1 } },
      lualine_x = { "progress", "location" },
      lualine_y = { "copilot", { "lsp_status", ignore_lsp = { "copilot" } } },
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
