local function lualine_theme(background)
  local Colors = background == "light"
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

local colors_name_light = "rosepine_dawn"
local colors_name_dark = "rosepine_moon"

return {
  "CGamesPlay/rose-pine-vim",
  name = "rose-pine",
  lazy = false,
  priority = 1000, -- Load this one first
  init = function()
    local function set_colorscheme(background)
      local colors_name = colors_name_light
      if background == "dark" then
        colors_name = colors_name_dark
      end
      if vim.g.colors_name ~= colors_name then
        vim.cmd.colorscheme(colors_name)
        require("lualine").setup({ options = { theme = lualine_theme(background) } })
      end
    end

    -- nvim polls the terminal background color on startup, and will
    -- automatically set the value of background with the result, but only if
    -- we didn't already set it ourselves. I'm using a fork of rosepine.vim
    -- that doesn't do this.
    local augroup_theme = vim.api.nvim_create_augroup("config.theme", { clear = true })
    vim.api.nvim_create_autocmd("OptionSet", {
      pattern = "background",
      callback = function()
        set_colorscheme(vim.o.background)
      end,
      group = augroup_theme,
    })

    -- I normally operate in light mode, and so we set a light colorscheme
    -- initially to avoid a dark flash in the likely case.
    set_colorscheme("light")
  end,
  lualine_theme = lualine_theme
}
