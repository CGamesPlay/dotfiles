local augroup = vim.api.nvim_create_augroup("config.theme", { clear = true })

-- Reapply the active Inkwell colorscheme (default linen) for the given
-- background, firing ColorScheme like :colorscheme does.
local applied
local function set_colorscheme(background)
  local inkwell = require("inkwell")
  local name = inkwell.palettes[vim.g.colors_name] and vim.g.colors_name or "linen"
  if applied ~= name .. background then
    applied = name .. background
    inkwell.load(name, background)
    vim.api.nvim_exec_autocmds("ColorScheme", { pattern = name })
  end
end

-- Manual toggles of 'background' (e.g. the toggle keymap).
vim.api.nvim_create_autocmd("OptionSet", {
  pattern = "background",
  nested = true,
  callback = function()
    set_colorscheme(vim.o.background)
  end,
  group = augroup,
})

-- I normally operate in light mode, and so we set a light colorscheme
-- initially to avoid a dark flash in the likely case.
set_colorscheme("light")

return {}
