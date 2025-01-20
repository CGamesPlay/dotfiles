-- A blazing fast and easy to configure neovim statusline plugin written in pure lua.

local function make_theme()
  local Colors = vim.o.background == "light"
      and {
        base = "#faf4ed",
        surface = "#fffaf3",
        overlay = "#f2e9e1",
        muted = "#9893a5",
        subtle = "#797593",
        text = "#575279",
        love = "#b4637a",
        gold = "#ea9d34",
        rose = "#d7827e",
        pine = "#286983",
        foam = "#56949f",
        iris = "#907aa9",
        highlight_low = "#f4ede8",
        highlight_med = "#dfdad9",
        highlight_high = "#cecacd",
        diff_add = "#d9e1dd",
        diff_delete = "#ecd7d6",
        diff_text = "#f3ddd7",
      }
    or {
      base = "#232136",
      surface = "#2a273f",
      overlay = "#393552",
      muted = "#6e6a86",
      subtle = "#908caa",
      text = "#e0def4",
      love = "#eb6f92",
      gold = "#f6c177",
      rose = "#ea9a97",
      pine = "#3e8fb0",
      foam = "#9ccfd8",
      iris = "#c4a7e7",
      highlight_low = "#2a283e",
      highlight_med = "#44415a",
      highlight_high = "#56526e",
      diff_add = "#3b4456",
      diff_delete = "#4b3148",
      diff_text = "#4b3949",
    }

  local M = {
    normal = {
      a = { fg = Colors.base, bg = Colors.rose, gui = "bold" },
      b = { fg = Colors.text, bg = Colors.overlay },
      c = { fg = Colors.text, bg = Colors.surface },
    },
    insert = { a = { fg = Colors.base, bg = Colors.pine, gui = "bold" } },
    visual = { a = { fg = Colors.base, bg = Colors.gold, gui = "bold" } },
    replace = { a = { fg = Colors.base, bg = Colors.love, gui = "bold" } },
    inactive = {
      a = { fg = Colors.muted, bg = Colors.overlay, gui = "bold" },
      b = { fg = Colors.muted, bg = Colors.surface },
      c = { fg = Colors.muted, bg = Colors.surface },
    },
  }

  M.terminal = M.insert

  return M
end

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
  opts = {
    options = {
      icons_enabled = false,
      theme = make_theme(),
    },
    sections = {
      lualine_a = { my_mode },
      lualine_b = { "diagnostics" },
      lualine_c = { { "filename", path = 1 } },
      lualine_x = {
        {
          "copilot",
          symbols = {
            status = {
              icons = {
                enabled = "⎈",
                sleep = "⎈",
                disabled = "-",
                warning = "W",
                unknown = "?",
              },
            },
          },
        },
        "filetype",
      },
      lualine_y = { "progress" },
      lualine_z = { "location" },
    },
    inactive_sections = {
      lualine_a = { my_mode },
      lualine_b = {},
      lualine_c = { { "filename", path = 1 } },
      lualine_x = { "filetype" },
      lualine_y = { "progress" },
      lualine_z = { "location" },
    },
  },
  config = function(_, opts)
    require("lualine").setup(opts)
    vim.api.nvim_create_autocmd("OptionSet", {
      pattern = "background",
      callback = function()
        require("lualine").setup({ options = { theme = make_theme() } })
      end,
    })
  end,
}
