if not vim.g.neovide then
  return
end

-- [[ Visual options for Neovide ]]
--- NOTE: some settings are also configured in ~/.config/neovide/config.toml
vim.g.neovide_theme = "auto"
-- g:neovide_transparency should be 0 if you want to unify transparency of content and title bar.
--vim.g.neovide_transparency = 1
--vim.g.transparency = 0.5
--vim.g.neovide_window_blurred = true
vim.opt.winblend = 15
vim.opt.pumblend = 15
vim.g.neovide_cursor_animation_length = 0.07
vim.g.neovide_cursor_trail_size = 0.4
vim.g.neovide_cursor_animate_command_line = false
vim.g.neovide_hide_mouse_when_typing = true
vim.g.neovide_padding_top = 10
vim.g.neovide_padding_bottom = 0
vim.g.neovide_padding_right = 10
vim.g.neovide_padding_left = 10

-- [[ Font ]]
vim.opt.linespace = 1
vim.opt.guifont = "JetBrains Mono NL:h13"

-- [[ GUI-only keybinds ]]
-- Set up key bindings for normal GUI app integration

-- Allow using Option as meta instead of symbol input
vim.g.neovide_input_macos_option_key_is_meta = "both"

-- Save
vim.keymap.set({ "n", "i" }, "<D-s>", "<Cmd>:w<CR>", { silent = true })
-- Copy/paste
vim.keymap.set("v", "<D-c>", '"+y')
vim.keymap.set("v", "<D-x>", '"+d')
vim.keymap.set({ "n", "v", "o", "c", "i", "t" }, "<D-v>", function()
  vim.api.nvim_paste(vim.fn.getreg("+"), true, -1)
end, { silent = true })
-- New tab, tab navigation
vim.keymap.set("n", "<D-t>", "<Cmd>tabnew<CR>", { silent = true })
vim.keymap.set("n", "<D-{>", "<Cmd>tabprev<CR>", { silent = true })
vim.keymap.set("n", "<D-}>", "<Cmd>tabnext<CR>", { silent = true })
-- Close buffer, uses a custom command.
vim.keymap.set("n", "<D-w>", "<Cmd>BW<CR>", { silent = true })

-- Command -/0/= to adjust zoom
vim.g.neovide_scale_factor = 1.0
local change_scale_factor = function(delta)
  vim.g.neovide_scale_factor = vim.g.neovide_scale_factor * delta
end
vim.keymap.set("n", "<D-0>", function()
  vim.g.neovide_scale_factor = 1
end)
vim.keymap.set("n", "<D-=>", function()
  change_scale_factor(1.25)
end)
vim.keymap.set("n", "<D-->", function()
  change_scale_factor(1 / 1.25)
end)
